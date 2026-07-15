from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from pipelines.infra.utils.nrw_logger import log_info, log_warning, LogTag
from pipelines.infra.utils.raster import BoundingBox
from pipelines.tropical_cyclone.constants import ATCF_WIND_RADII_THRESHOLD_KNOTS

logger = logging.getLogger(__name__)


@dataclass
class TrackFix:
    latitude: float
    longitude: float
    max_sustained_wind_knots: float
    min_sea_level_pressure_mb: float


@dataclass
class TimeIntervalTrackFix:
    time_interval_start: str
    time_interval_end: str
    ensemble_track_fixes: list[TrackFix]


def extract_track(
    gefs_track_member_paths: list[str],
    bounds: BoundingBox,
) -> list[TimeIntervalTrackFix]:
    """
    Read GEFS ATCF track files (one file per member, all lead times as rows) into a storm-position
    fix per ensemble member per native 3h lead-time step, filtered to `bounds`.
    """
    fixes_by_lead_hour: dict[int, list[TrackFix]] = {}
    forecast_cycle_datetime: datetime | None = None

    for path in gefs_track_member_paths:
        if not os.path.exists(path):
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS track file not found, skipping: {path}",
            )
            continue

        parsed = _parse_gefs_track_path(path)
        if parsed is None:
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized GEFS track file path, skipping: {path}",
            )
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime
        elif parsed.cycle_datetime != forecast_cycle_datetime:
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS track file from different forecast cycle ({parsed.cycle_datetime}) "
                f"than expected ({forecast_cycle_datetime}), skipping: {path}",
            )
            continue

        log_info(
            logger, LogTag.TROPICAL_CYCLONE_LOGIC, f"Extracting track fixes from {path}"
        )
        for lead_hour, fix in _read_track_fixes(path, bounds):
            fixes_by_lead_hour.setdefault(lead_hour, []).append(fix)

    if forecast_cycle_datetime is None:
        return []

    return [
        TimeIntervalTrackFix(
            time_interval_start=time_interval_start,
            time_interval_end=time_interval_end,
            ensemble_track_fixes=fixes_by_lead_hour[lead_hour],
        )
        for lead_hour in sorted(fixes_by_lead_hour)
        for time_interval_start, time_interval_end in [
            _lead_hour_to_time_interval(forecast_cycle_datetime, lead_hour)
        ]
    ]


# Matches the NOMADS ens_tracker layout, confirmed against real files:
#   gefs.<YYYYMMDD>/<HH>/tctrack/<member>.t<HH>z.cyclone.trackatcfunix
# One file per member covers every lead time as rows (unlike the wind GRIB2 files, which are one
# file per member per lead time) - <member> is ac00 (control) or ap01..ap30 (30 perturbed members).
_GEFS_TRACK_PATH_PATTERN = re.compile(
    r"gefs\.(?P<date>\d{8})/(?P<cycle_hour>\d{2})/tctrack/"
    r"a[cp]\d{2}\.t\d{2}z\.cyclone\.trackatcfunix$"
)


@dataclass
class _ParsedGefsTrackPath:
    cycle_datetime: datetime


def _parse_gefs_track_path(path: str) -> _ParsedGefsTrackPath | None:
    match = _GEFS_TRACK_PATH_PATTERN.search(path.replace("\\", "/"))
    if match is None:
        return None
    cycle_datetime = datetime.strptime(
        match.group("date") + match.group("cycle_hour"), "%Y%m%d%H"
    )
    return _ParsedGefsTrackPath(cycle_datetime=cycle_datetime)


def _lead_hour_to_time_interval(
    forecast_cycle_datetime: datetime, lead_hour: int
) -> tuple[str, str]:
    interval_start = forecast_cycle_datetime + timedelta(hours=lead_hour)
    interval_end = interval_start + timedelta(hours=3)
    return (
        interval_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        interval_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def _read_track_fixes(path: str, bounds: BoundingBox) -> list[tuple[int, TrackFix]]:
    """
    Parse one ATCF track file (plain comma-separated text, not gzipped). A file can contain
    multiple storms (different BASIN/CY) interleaved - fixes are filtered to `bounds` rather than
    to a specific storm, since that's the region this forecast run cares about.
    """
    min_lon, min_lat, max_lon, max_lat = bounds
    fixes: list[tuple[int, TrackFix]] = []

    with open(path) as track_file:
        for line in track_file:
            fields = [field.strip() for field in line.split(",")]
            if len(fields) < 12 or int(fields[11]) != ATCF_WIND_RADII_THRESHOLD_KNOTS:
                continue

            latitude = _parse_atcf_coordinate(fields[6], positive_suffix="N")
            longitude = _parse_atcf_coordinate(fields[7], positive_suffix="E")
            if not (min_lon <= longitude <= max_lon and min_lat <= latitude <= max_lat):
                continue

            fixes.append(
                (
                    int(fields[5]),
                    TrackFix(
                        latitude=latitude,
                        longitude=longitude,
                        max_sustained_wind_knots=float(fields[8]),
                        min_sea_level_pressure_mb=float(fields[9]),
                    ),
                )
            )

    return fixes


def _parse_atcf_coordinate(raw: str, positive_suffix: str) -> float:
    """Parse an ATCF lat/lon field like '208N' or '1276E' (tenths of a degree + direction)."""
    value = float(raw[:-1]) / 10
    return value if raw[-1] == positive_suffix else -value
