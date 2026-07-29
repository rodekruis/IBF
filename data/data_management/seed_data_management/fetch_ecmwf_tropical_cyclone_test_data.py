"""Download a small slice of real ECMWF open-data IFS forecasts into the tropical-cyclone
`bronze/` fixture directory, for locally testing the ECMWF branch of the TC pipeline
(`extract_forecast.py` / `extract_track.py`).

The ECMWF stream names and native wind cadence used to build the download are taken from
`pipelines.tropical_cyclone.constants`. What it downloads does not depend on any country: ECMWF
open-data files are global, and the pipeline slices them to a country's bounds at read time. The
script only warns if no country is currently configured for `ForecastSource.ECMWF` (none is by
default - see COUNTRY_CONFIGS), since the fixtures it writes are then downloaded but unused until
a country is switched over.

What it writes (matching the layouts `forecast.py`'s ECMWF placeholder loaders and the
`extract_*` parsers expect):
  pipelines/tropical_cyclone/bronze/ecmwf_wind/<YYYYMMDD>/<HH>z/ifs/0p25/<stream>/
      <YYYYMMDD><HH>0000-<step>h-<stream>-<fc|ef>.grib2
  pipelines/tropical_cyclone/bronze/ecmwf_track/<YYYYMMDD>/<HH>z/ifs/0p25/<stream>/
      <YYYYMMDD><HH>0000-<step>h-<stream>-tf.bufr

Wind is fetched efficiently: only the 10 m u/v components (and only a few ensemble members) are
pulled, using each GRIB2 file's `.index` sidecar to issue HTTP byte-range requests - so a per-step
enfo file with all 50 members is never downloaded in full. Track BUFR files are small and fetched
whole; they only exist when ECMWF is actively tracking a cyclone, so a 404 there is not an error.

`bronze/` is gitignored - these files are a local-testing convenience, never committed.

Usage:
    cd data
    uv run python data_management/seed_data_management/fetch_ecmwf_tropical_cyclone_test_data.py
    # options:
    uv run python data_management/seed_data_management/fetch_ecmwf_tropical_cyclone_test_data.py \
        --members 10 --steps 0,3,6,9 --cycle 2026072800
    # full 7-day window (0..144h by 3h, then 150..168h by 6h) - pair with a small --members:
    uv run python data_management/seed_data_management/fetch_ecmwf_tropical_cyclone_test_data.py \
        --full-window --members 5
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from pipelines.infra.data_types.enums import ForecastSource
from pipelines.tropical_cyclone import constants

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ECMWF open-data forecast root (mirrored on AWS/Azure/GCS); only ~4 days of history are kept.
ECMWF_OPEN_DATA_ROOT = "https://data.ecmwf.int/forecasts"

# 10 m wind components we need; the parser combines them into a sustained wind speed.
WIND_PARAMS = ("10u", "10v")

# open-data product `type` per stream, for the wind (GRIB2) and track (BUFR) products.
WIND_TYPE_BY_STREAM = {
    constants.ECMWF_STREAM_CONTROL: "fc",  # oper -> deterministic control forecast
    constants.ECMWF_STREAM_PERTURBED: "ef",  # enfo -> perturbed ensemble members
}
TRACK_TYPE = "tf"  # tropical-cyclone track BUFR, same token for oper and enfo

# Bronze fixture roots (gitignored), resolved next to the tropical_cyclone package.
_BRONZE_DIR = Path(constants.__file__).resolve().parent / "bronze"
WIND_ROOT = _BRONZE_DIR / "ecmwf_wind"
TRACK_ROOT = _BRONZE_DIR / "ecmwf_track"

# How many recent 6-hourly cycles to probe before giving up finding an available one.
_MAX_CYCLE_LOOKBACK = 8

# Full forecast window (7 days = 168h), matching the TC alert config's seeded "lead-time-spectrum".
# ECMWF ENS 0p25 is 3-hourly out to 144h and 6-hourly beyond, so --full-window switches cadence
# there (there are no 3-hourly steps past 144h to fetch).
_FULL_WINDOW_MAX_HOURS = 168
_ECMWF_THREE_HOURLY_MAX_HOURS = 144


def _cycle_relative_dir(cycle: datetime) -> str:
    """The `<YYYYMMDD>/<HH>z/ifs/0p25` path segment shared by every open-data file in a run."""
    return f"{cycle:%Y%m%d}/{cycle:%H}z/ifs/0p25"


def _file_stem(cycle: datetime, step: int, stream: str, product_type: str) -> str:
    return f"{cycle:%Y%m%d}{cycle:%H}0000-{step}h-{stream}-{product_type}"


def _open_data_url(
    cycle: datetime, step: int, stream: str, product_type: str, extension: str
) -> str:
    """Build an ECMWF open-data file URL. The GRIB2 data lives at `<stem>.grib2`, its byte-range
    index at `<stem>.index` (same stem, different extension - not `<stem>.grib2.index`), and track
    BUFR at `<stem>.bufr`."""
    stem = _file_stem(cycle, step, stream, product_type)
    return f"{ECMWF_OPEN_DATA_ROOT}/{_cycle_relative_dir(cycle)}/{stream}/{stem}.{extension}"


def _bronze_path(root: Path, url: str) -> Path:
    """Mirror an open-data file's `<date>/<hh>z/ifs/0p25/<stream>/<file>` tail under a bronze root,
    so the pipeline's ECMWF path parsers recognise it."""
    tail = url.split(f"{ECMWF_OPEN_DATA_ROOT}/", 1)[1]
    return root.joinpath(*tail.split("/"))


def _resolve_cycle(session: requests.Session, override: str | None) -> datetime:
    """Return the ECMWF cycle to download: an explicit --cycle (YYYYMMDDHH) if given, otherwise the
    most recent 00/06/12/18 UTC cycle whose enfo wind is already published."""
    if override is not None:
        return datetime.strptime(override, "%Y%m%d%H").replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    candidate = now.replace(hour=(now.hour // 6) * 6, minute=0, second=0, microsecond=0)
    for _ in range(_MAX_CYCLE_LOOKBACK):
        index_url = _open_data_url(
            candidate, 0, constants.ECMWF_STREAM_PERTURBED, "ef", "index"
        )
        if session.get(index_url, timeout=60).status_code == 200:
            return candidate
        candidate -= timedelta(hours=6)
    raise RuntimeError(
        f"No published ECMWF enfo cycle found in the last {_MAX_CYCLE_LOOKBACK} attempts "
        f"(searched back from {now:%Y-%m-%d %H}:00 UTC)"
    )


def _selected_index_ranges(
    index_text: str, stream: str, member_numbers: set[int]
) -> list[tuple[int, int]]:
    """From a GRIB2 `.index` (one JSON object per message), pick the (offset, length) byte ranges
    for the 10 m wind params - restricted to `member_numbers` for the perturbed `enfo` stream (the
    control `oper` file has a single member with no `number` key)."""
    ranges: list[tuple[int, int]] = []
    for line in index_text.splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("param") not in WIND_PARAMS:
            continue
        if stream == constants.ECMWF_STREAM_PERTURBED:
            number = entry.get("number")
            if number is None or int(number) not in member_numbers:
                continue
        ranges.append((int(entry["_offset"]), int(entry["_length"])))
    return ranges


def _download_wind_file(
    session: requests.Session,
    cycle: datetime,
    step: int,
    stream: str,
    member_numbers: set[int],
) -> bool:
    """Fetch only the needed 10 m wind messages of one per-step GRIB2 file via byte-range requests,
    concatenating them into a valid GRIB2 in the bronze tree. Returns whether a file was written.
    """
    product_type = WIND_TYPE_BY_STREAM[stream]
    grib_url = _open_data_url(cycle, step, stream, product_type, "grib2")
    index_url = _open_data_url(cycle, step, stream, product_type, "index")
    index_response = session.get(index_url, timeout=60)
    if index_response.status_code != 200:
        logger.warning(f"No index for {grib_url} (status {index_response.status_code})")
        return False

    ranges = _selected_index_ranges(index_response.text, stream, member_numbers)
    if not ranges:
        logger.warning(f"No matching wind messages in index for {grib_url}")
        return False

    out_path = _bronze_path(WIND_ROOT, grib_url)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as grib_file:
        for offset, length in sorted(ranges):
            headers = {"Range": f"bytes={offset}-{offset + length - 1}"}
            message = session.get(grib_url, headers=headers, timeout=60)
            message.raise_for_status()
            grib_file.write(message.content)

    logger.info(f"Wrote {out_path} ({len(ranges)} messages)")
    return True


def _download_track_file(
    session: requests.Session, cycle: datetime, step: int, stream: str
) -> bool:
    """Fetch a whole track BUFR file (small) into the bronze tree. Returns whether a file was
    written; a missing file (no active cyclone) is expected and not an error."""
    track_url = _open_data_url(cycle, step, stream, TRACK_TYPE, "bufr")
    response = session.get(track_url, timeout=60)
    if response.status_code == 404:
        logger.info(f"No track file at {track_url} (no active cyclone this run?)")
        return False
    response.raise_for_status()

    out_path = _bronze_path(TRACK_ROOT, track_url)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(response.content)
    logger.info(f"Wrote {out_path} ({len(response.content)} bytes)")
    return True


def _parse_steps(raw: str) -> list[int]:
    return [int(part) for part in raw.split(",") if part.strip()]


def _full_window_steps(cycle: datetime) -> list[int]:
    """Lead-time steps spanning the forecast window at ECMWF's native cadence: 3-hourly
    (ECMWF_NATIVE_LEAD_TIME_STEP_HOURS) out to 144h, then 6-hourly. Per ECMWF docs the ENS wind
    horizon is 360h at 00/12 UTC but only 144h at 06/18 UTC, so the window caps at 168h for 00/12
    and at 144h (no 6-hourly tail) for 06/18."""
    native_step = constants.ECMWF_NATIVE_LEAD_TIME_STEP_HOURS
    max_hours = (
        _FULL_WINDOW_MAX_HOURS
        if cycle.hour in (0, 12)
        else _ECMWF_THREE_HOURLY_MAX_HOURS
    )
    three_hourly = list(range(0, _ECMWF_THREE_HOURLY_MAX_HOURS + 1, native_step))
    six_hourly = list(range(_ECMWF_THREE_HOURLY_MAX_HOURS + 6, max_hours + 1, 6))
    return three_hourly + six_hourly


def _track_horizon_step(cycle: datetime) -> int:
    """ECMWF publishes cyclone tracks out to 360h for the 00/12 UTC runs and 144h for 06/18 UTC."""
    return 360 if cycle.hour in (0, 12) else 144


def main() -> None:
    """Resolve the target cycle and download the wind and track fixtures into `bronze/`."""
    native_step = constants.ECMWF_NATIVE_LEAD_TIME_STEP_HOURS
    default_steps = [0, native_step, 2 * native_step]

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--members",
        type=int,
        default=5,
        help="Number of perturbed enfo members to fetch (1..N). Default 5.",
    )
    step_group = parser.add_mutually_exclusive_group()
    step_group.add_argument(
        "--steps",
        type=_parse_steps,
        default=default_steps,
        help="Comma-separated wind lead hours to fetch. "
        f"Default {','.join(map(str, default_steps))}.",
    )
    step_group.add_argument(
        "--full-window",
        action="store_true",
        help="Fetch the full forecast window at ECMWF's native cadence instead of --steps: "
        "0..144h by 3h then 150..168h by 6h for 00/12 UTC cycles, capped at 144h for 06/18 UTC. "
        "Large at high member counts - pair with a small --members.",
    )
    parser.add_argument(
        "--cycle",
        type=str,
        default=None,
        help="Force a specific cycle as YYYYMMDDHH (UTC). Default: latest published.",
    )
    args = parser.parse_args()

    # Warn rather than exit: what gets downloaded is country-independent (ECMWF open-data files
    # are global), so the fetch is still valid - the fixtures just sit unused until some country
    # is pointed at ECMWF.
    if not any(
        config.forecast_source is ForecastSource.ECMWF
        for config in constants.COUNTRY_CONFIGS.values()
    ):
        logger.warning(
            "No country is currently configured for ECMWF (see COUNTRY_CONFIGS in "
            "tropical_cyclone/constants.py) - fetching anyway, but nothing will read these "
            "fixtures until one is switched over."
        )

    member_numbers = set(range(1, args.members + 1))
    session = requests.Session()

    cycle = _resolve_cycle(session, args.cycle)
    steps = _full_window_steps(cycle) if args.full_window else args.steps
    logger.info(
        f"Fetching ECMWF test data - cycle {cycle:%Y-%m-%d %H}:00 UTC, "
        f"wind steps {steps}, enfo members 1..{args.members}"
    )

    wind_files = 0
    for step in steps:
        for stream in (
            constants.ECMWF_STREAM_CONTROL,
            constants.ECMWF_STREAM_PERTURBED,
        ):
            if _download_wind_file(session, cycle, step, stream, member_numbers):
                wind_files += 1

    track_step = _track_horizon_step(cycle)
    track_files = 0
    for stream in (constants.ECMWF_STREAM_CONTROL, constants.ECMWF_STREAM_PERTURBED):
        if _download_track_file(session, cycle, track_step, stream):
            track_files += 1

    logger.info(
        f"Done: {wind_files} wind file(s) under {WIND_ROOT}, "
        f"{track_files} track file(s) under {TRACK_ROOT}."
    )


if __name__ == "__main__":
    main()
