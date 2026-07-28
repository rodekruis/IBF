from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import fmean

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import ForecastSource
from pipelines.infra.utils.nrw_logger import log_info, log_warning, LogTag
from pipelines.infra.utils.raster import BoundingBox
from pipelines.tropical_cyclone.constants import (
    ATCF_WIND_RADII_THRESHOLD_KNOTS,
    ECMWF_MSLP_PA_TO_HPA,
    ECMWF_TRACK_FIX_INTERVAL_HOURS,
    GEFS_NATIVE_LEAD_TIME_STEP_HOURS,
    METERS_PER_SECOND_TO_KNOTS,
)
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalSeverity

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
    track_member_paths: list[str],
    bounds: BoundingBox,
    forecast_source: ForecastSource,
) -> list[TimeIntervalTrackFix]:
    """
    Read a country's forecast-source cyclone track into storm-position fixes bucketed per native
    fix time, filtered to `bounds`.

    Dispatches on forecast_source because GEFS and ECMWF store tracks completely differently: GEFS
    ships ATCF plain text (one file per member, every lead time as rows), ECMWF ships BUFR (one
    file per run, one message per storm, ensemble members as subsets) - see _load_gefs_track_fixes
    / _load_ecmwf_track_fixes. Everything downstream of a populated {lead_hour: [TrackFix, ...]} map
    is source-agnostic (see _build_time_interval_track_fixes). Per-member track identity is
    intentionally not kept: the only consumer (derive_storm_centroid) averages fixes, so every
    member's fix for a lead hour is pooled.
    """
    if forecast_source == ForecastSource.GEFS:
        fix_interval_hours = GEFS_NATIVE_LEAD_TIME_STEP_HOURS
        fixes_by_lead_hour, forecast_cycle_datetime = _load_gefs_track_fixes(
            track_member_paths, bounds
        )
    elif forecast_source == ForecastSource.ECMWF:
        fix_interval_hours = ECMWF_TRACK_FIX_INTERVAL_HOURS
        fixes_by_lead_hour, forecast_cycle_datetime = _load_ecmwf_track_fixes(
            track_member_paths, bounds
        )
    else:
        raise ValueError(
            f"Unsupported forecast source for track extraction: {forecast_source}"
        )

    if forecast_cycle_datetime is None:
        return []

    return _build_time_interval_track_fixes(
        fixes_by_lead_hour, forecast_cycle_datetime, fix_interval_hours
    )


def _load_gefs_track_fixes(
    gefs_track_member_paths: list[str],
    bounds: BoundingBox,
) -> tuple[dict[int, list[TrackFix]], datetime | None]:
    """
    Load GEFS ATCF track files (one file per member, every lead time as rows) into a
    {lead_hour: [TrackFix, ...]} map, filtered to `bounds`. Returns the map plus the single forecast
    cycle datetime shared by every file (None if nothing loaded).
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

    return fixes_by_lead_hour, forecast_cycle_datetime


def _build_time_interval_track_fixes(
    fixes_by_lead_hour: dict[int, list[TrackFix]],
    forecast_cycle_datetime: datetime,
    fix_interval_hours: int,
) -> list[TimeIntervalTrackFix]:
    """
    Source-agnostic tail: turn a {lead_hour: [TrackFix, ...]} map into lead-hour-sorted
    TimeIntervalTrackFix buckets. `fix_interval_hours` is the source's own fix cadence (GEFS 3h,
    ECMWF 6h), used only to derive each fix's reported time-interval end.
    """
    return [
        TimeIntervalTrackFix(
            time_interval_start=time_interval_start,
            time_interval_end=time_interval_end,
            ensemble_track_fixes=fixes_by_lead_hour[lead_hour],
        )
        for lead_hour in sorted(fixes_by_lead_hour)
        for time_interval_start, time_interval_end in [
            _lead_hour_to_time_interval(
                forecast_cycle_datetime, lead_hour, fix_interval_hours
            )
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
    forecast_cycle_datetime: datetime, lead_hour: int, interval_hours: int
) -> tuple[str, str]:
    interval_start = forecast_cycle_datetime + timedelta(hours=lead_hour)
    interval_end = interval_start + timedelta(hours=interval_hours)
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


# Matches ECMWF's open-data IFS cyclone-track BUFR path layout (confirmed against real files):
#   <YYYYMMDD>/<HH>z/ifs/0p25/<stream>/<YYYYMMDD><HH>0000-<step>h-<stream>-tf.bufr
# One BUFR file per run (not per member, not per lead time): an `oper` file (single control track)
# or an `enfo` file (all ensemble members as BUFR subsets). <step> is 360 (00/12 UTC) or 144
# (06/18 UTC). The file only exists when ECMWF is tracking at least one cyclone.
_ECMWF_TRACK_PATH_PATTERN = re.compile(
    r"(?P<date>\d{8})/(?P<cycle_hour>\d{2})z/ifs/0p25/(?P<stream>oper|enfo)/"
    r"\d{8}\d{2}0000-\d+h-(?P=stream)-tf\.bufr$"
)

# ECMWF BUFR meteorologicalAttributeSignificance code for the storm centre (as opposed to the
# location-of-maximum-wind fields that share the same latitude/longitude sequence).
_ECMWF_BUFR_CENTRE_SIGNIFICANCE = 1

# eccodes fills absent numeric BUFR values with a large sentinel; treat anything at/beyond this
# magnitude as missing rather than a real coordinate/measurement.
_ECMWF_BUFR_MISSING_THRESHOLD = 1e10


@dataclass
class _ParsedEcmwfTrackPath:
    cycle_datetime: datetime


def _parse_ecmwf_track_path(path: str) -> _ParsedEcmwfTrackPath | None:
    match = _ECMWF_TRACK_PATH_PATTERN.search(path.replace("\\", "/"))
    if match is None:
        return None
    cycle_datetime = datetime.strptime(
        match.group("date") + match.group("cycle_hour"), "%Y%m%d%H"
    )
    return _ParsedEcmwfTrackPath(cycle_datetime=cycle_datetime)


def _load_ecmwf_track_fixes(
    ecmwf_track_paths: list[str],
    bounds: BoundingBox,
) -> tuple[dict[int, list[TrackFix]], datetime | None]:
    """
    Load ECMWF BUFR cyclone-track files into a {lead_hour: [TrackFix, ...]} map, filtered to
    `bounds`. Unlike GEFS's one-file-per-member ATCF, ECMWF is one BUFR file per run (oper and/or
    enfo), each holding one message per storm with the ensemble members as subsets - so a single
    path contributes fixes for many members (see _read_ecmwf_track_fixes). Returns the map plus the
    single forecast cycle datetime shared by every file (None if nothing loaded).
    """
    fixes_by_lead_hour: dict[int, list[TrackFix]] = {}
    forecast_cycle_datetime: datetime | None = None

    for path in ecmwf_track_paths:
        if not os.path.exists(path):
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"ECMWF track file not found, skipping: {path}",
            )
            continue

        parsed = _parse_ecmwf_track_path(path)
        if parsed is None:
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized ECMWF track file path, skipping: {path}",
            )
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime
        elif parsed.cycle_datetime != forecast_cycle_datetime:
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"ECMWF track file from different forecast cycle ({parsed.cycle_datetime}) "
                f"than expected ({forecast_cycle_datetime}), skipping: {path}",
            )
            continue

        log_info(
            logger, LogTag.TROPICAL_CYCLONE_LOGIC, f"Extracting track fixes from {path}"
        )
        for lead_hour, fix in _read_ecmwf_track_fixes(path, bounds):
            fixes_by_lead_hour.setdefault(lead_hour, []).append(fix)

    return fixes_by_lead_hour, forecast_cycle_datetime


def _read_ecmwf_track_fixes(
    path: str, bounds: BoundingBox
) -> list[tuple[int, TrackFix]]:
    """
    Parse one ECMWF cyclone-track BUFR file into (lead_hour, TrackFix) pairs, filtered to `bounds`.
    A file holds one BUFR message per storm; each message's ensemble members are subsets. For every
    fix the storm-centre latitude/longitude is selected via meteorologicalAttributeSignificance ==
    centre (the max-wind location shares the same lat/lon sequence), paired with the fix's 6-hourly
    `timePeriod` lead hour, its m/s windSpeedAt10M (converted to knots) and its pascal
    pressureReducedToMeanSeaLevel (converted to hPa). Member identity is intentionally dropped -
    every member's fix is pooled per lead hour, matching the GEFS handling.


    """
    import eccodes  # lazy: only ECMWF-track countries need the BUFR bindings

    min_lon, min_lat, max_lon, max_lat = bounds
    fixes: list[tuple[int, TrackFix]] = []

    with open(path, "rb") as bufr_file:
        while True:
            message = eccodes.codes_bufr_new_from_file(bufr_file)
            if message is None:
                break
            try:
                eccodes.codes_set(message, "unpack", 1)
                significances = _bufr_float_array(
                    eccodes.codes_get_array(
                        message, "meteorologicalAttributeSignificance"
                    )
                )
                latitudes = _bufr_float_array(
                    eccodes.codes_get_array(message, "latitude")
                )
                longitudes = _bufr_float_array(
                    eccodes.codes_get_array(message, "longitude")
                )
                winds_ms = _bufr_float_array(
                    eccodes.codes_get_array(message, "windSpeedAt10M")
                )
                pressures_pa = _bufr_float_array(
                    eccodes.codes_get_array(message, "pressureReducedToMeanSeaLevel")
                )
                time_periods = _bufr_float_array(
                    eccodes.codes_get_array(message, "timePeriod")
                )
            finally:
                eccodes.codes_release(message)

            fixes.extend(
                _ecmwf_message_fixes(
                    significances,
                    latitudes,
                    longitudes,
                    winds_ms,
                    pressures_pa,
                    time_periods,
                    bounds=(min_lon, min_lat, max_lon, max_lat),
                )
            )

    return fixes


def _ecmwf_message_fixes(
    significances: list[float],
    latitudes: list[float],
    longitudes: list[float],
    winds_ms: list[float],
    pressures_pa: list[float],
    time_periods: list[float],
    bounds: BoundingBox,
) -> list[tuple[int, TrackFix]]:
    """
    Pair the flat per-message BUFR arrays into (lead_hour, TrackFix) storm-centre fixes. Kept
    separate from the eccodes I/O in _read_ecmwf_track_fixes so it stays pure and unit-testable.
    The k-th storm-centre entry (significance == centre) is matched to the k-th `timePeriod`.
    """
    min_lon, min_lat, max_lon, max_lat = bounds
    centre_indices = [
        index
        for index, significance in enumerate(significances)
        if not _ecmwf_value_missing(significance)
        and int(significance) == _ECMWF_BUFR_CENTRE_SIGNIFICANCE
    ]

    fixes: list[tuple[int, TrackFix]] = []
    for centre_rank, index in enumerate(centre_indices):
        if centre_rank >= len(time_periods) or index >= min(
            len(latitudes), len(longitudes)
        ):
            continue
        lead_hour = time_periods[centre_rank]
        latitude = latitudes[index]
        longitude = longitudes[index]
        if (
            _ecmwf_value_missing(lead_hour)
            or _ecmwf_value_missing(latitude)
            or _ecmwf_value_missing(longitude)
        ):
            continue
        if not (min_lon <= longitude <= max_lon and min_lat <= latitude <= max_lat):
            continue
        fixes.append(
            (
                int(lead_hour),
                TrackFix(
                    latitude=float(latitude),
                    longitude=float(longitude),
                    max_sustained_wind_knots=_ecmwf_optional(winds_ms, index)
                    * METERS_PER_SECOND_TO_KNOTS,
                    min_sea_level_pressure_mb=_ecmwf_optional(pressures_pa, index)
                    / ECMWF_MSLP_PA_TO_HPA,
                ),
            )
        )
    return fixes


def _ecmwf_value_missing(value: float) -> bool:
    return abs(value) >= _ECMWF_BUFR_MISSING_THRESHOLD


def _bufr_float_array(codes_array: object) -> list[float]:
    """Coerce an eccodes `codes_get_array` result (numpy array, list, or None for an absent key)
    into a plain list[float]."""
    if codes_array is None:
        return []
    return [float(value) for value in codes_array]  # type: ignore[union-attr]


def _ecmwf_optional(values: list[float], index: int) -> float:
    """A co-indexed BUFR measurement (wind/pressure), or 0.0 when absent or flagged missing - these
    fields are carried on TrackFix but not used by the centroid step, so a missing one must not
    drop an otherwise-valid storm-centre fix."""
    if index >= len(values):
        return 0.0
    value = values[index]
    return 0.0 if _ecmwf_value_missing(value) else float(value)


def derive_storm_centroid(
    time_interval_track_fixes: list[TimeIntervalTrackFix],
    time_interval_severities: list[TimeIntervalSeverity],
    admin_areas: AdminAreasSet,
) -> Centroid:
    """
    Mean lat/lon across ensemble members at the same bucket compute_alert_extent picks as
    peak-intensity (highest MEDIAN wind speed) - the alert centroid should reflect where the storm
    actually is at the moment being reported, not a flat average smeared across the whole forecast
    window. Falls back to every bucket's fixes combined if track data has no fix at exactly that
    time (track's native cadence can differ from whatever wind lead times were fetched), and to the
    admin-area centroid only when there are no track fixes at all (e.g. no storm currently within
    the country's monitoring box).
    """
    peak_bucket = max(
        time_interval_severities, key=lambda severity: severity.median_wind_speed
    )
    peak_track_bucket = next(
        (
            bucket
            for bucket in time_interval_track_fixes
            if bucket.time_interval_start == peak_bucket.time_interval_start
        ),
        None,
    )

    fixes = (
        peak_track_bucket.ensemble_track_fixes
        if peak_track_bucket is not None and peak_track_bucket.ensemble_track_fixes
        else [
            fix
            for bucket in time_interval_track_fixes
            for fix in bucket.ensemble_track_fixes
        ]
    )
    if fixes:
        return Centroid(
            latitude=fmean(fix.latitude for fix in fixes),
            longitude=fmean(fix.longitude for fix in fixes),
        )

    geometries = [area.to_geometry() for area in admin_areas.admin_areas.values()]
    if not geometries:
        return Centroid(latitude=0.0, longitude=0.0)

    geometry_centroids = [geometry.centroid for geometry in geometries]
    return Centroid(
        latitude=fmean(point.y for point in geometry_centroids),
        longitude=fmean(point.x for point in geometry_centroids),
    )
