from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import fmean

from shapely.geometry import box, Point
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import ForecastSource
from pipelines.infra.utils import nrw_logger
from pipelines.infra.utils.raster import BoundingBox, pad_bounding_box
from pipelines.tropical_cyclone.constants import (
    ATCF_WIND_RADII_THRESHOLD_KNOTS,
    ECMWF_MSLP_PA_TO_HPA,
    GEFS_TRACK_NATIVE_LEAD_TIME_STEP_HOURS,
    METERS_PER_SECOND_TO_KNOTS,
)
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalWindSpeedSeverity

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


@dataclass
class StormTrack:
    """
    One tracked storm's fixes, bucketed per native fix time.

    Storm identity lives here rather than on TrackFix because `ensemble_track_fixes` pools every
    member's fix for one lead hour: identity on the individual fix would allow a bucket whose
    members disagree about which storm they belong to.
    """

    basin: str
    storm_number: str
    season_year: int
    time_interval_track_fixes: list[TimeIntervalTrackFix]

    @property
    def storm_identifier(self) -> str:
        """
        Stable per-storm identifier, e.g. "WP24_2025" - deliberately the same across pipeline runs
        so a re-run updates that storm's event instead of creating a duplicate.

        The basin is part of it because ATCF's cyclone number is only unique within one basin and
        season. Two edges where the identifier does change for one physical storm, both rare, both
        accepted rather than solved here: a storm live across New Year takes the new year's cycle,
        and a storm crossing a basin boundary (east Pacific into central Pacific at 140W) is
        renumbered by the tracker itself. The season is the forecast cycle's calendar year, which
        holds for the northern-hemisphere basins this pipeline serves; a southern-hemisphere season
        spans two calendar years and would need its own rule.
        """
        return f"{self.basin}{self.storm_number}_{self.season_year}"


@dataclass
class _ParsedTrackFixRow:
    """One ATCF row that survived the wind-radii, bounds and invest filters."""

    basin: str
    storm_number: str
    lead_hour: int
    track_fix: TrackFix


@dataclass
class _StormFixesByLeadHour:
    """One storm's pooled ensemble fixes, before they are bucketed into time intervals."""

    basin: str
    storm_number: str
    fixes_by_lead_hour: dict[int, list[TrackFix]]


def extract_track(
    track_member_paths: list[str],
    bounds: BoundingBox,
    forecast_source: ForecastSource,
) -> list[StormTrack]:
    """
    Read a country's forecast-source cyclone tracks into one StormTrack per tracked storm, each
    holding that storm's fixes bucketed per native fix time, filtered to `bounds`.

    A single ATCF file interleaves every storm the tracker is following worldwide, so grouping by
    (basin, cyclone number) is what makes one alert per storm possible - without it a storm on the
    far side of the world is pooled into the same fixes as one making landfall. Storms are returned
    in (basin, storm_number) order so event order does not depend on row order across member files.

    Per-member track identity is intentionally not kept: the only consumer (derive_alert_centroid)
    averages fixes, so every member's fix for a storm's lead hour is pooled.

    GEFS only. ECMWF stores tracks completely differently (BUFR, one file per run, one message per
    storm, members as subsets) and is not implemented - see the raise below.
    """
    if forecast_source != ForecastSource.GEFS:
        raise NotImplementedError(
            f"Multi-storm track extraction is implemented for {ForecastSource.GEFS} only, "
            f"got '{forecast_source}'. Notes for whoever picks up ECMWF: its BUFR file already "
            f"holds one message per storm, so grouping needs no interleaved-row parsing - one "
            f"message maps to one StormTrack. _load_ecmwf_track_fixes/_read_ecmwf_track_fixes are "
            f"left in place as the starting point, but they pool every message into a single "
            f"{{lead_hour: [TrackFix, ...]}} map with no storm dimension. Feed "
            f"ECMWF_TRACK_FIX_INTERVAL_HOURS to _build_time_interval_track_fixes as before. Also "
            f"worth knowing: each BUFR message carries 'stormIdentifier' (e.g. '15W') and "
            f"'longStormName' (e.g. 'DOLPHIN'), so ECMWF can name a storm directly where GEFS's "
            f"ATCF rows carry no name at all - and identifiers 70-79 are its unnamed disturbances, "
            f"the equivalent of the ATCF invests _is_invest_storm_number drops."
        )

    storms, forecast_cycle_datetime = _load_gefs_track_fixes(track_member_paths, bounds)
    if forecast_cycle_datetime is None:
        return []

    return [
        StormTrack(
            basin=storm.basin,
            storm_number=storm.storm_number,
            season_year=forecast_cycle_datetime.year,
            time_interval_track_fixes=_build_time_interval_track_fixes(
                storm.fixes_by_lead_hour,
                forecast_cycle_datetime,
                GEFS_TRACK_NATIVE_LEAD_TIME_STEP_HOURS,
            ),
        )
        for storm in storms
    ]


def _load_gefs_track_fixes(
    gefs_track_member_paths: list[str],
    bounds: BoundingBox,
) -> tuple[list[_StormFixesByLeadHour], datetime | None]:
    """
    Load GEFS ATCF track files (one file per member, every lead time as rows) into one
    _StormFixesByLeadHour per storm, filtered to `bounds`. Every member file contributes rows for
    the same set of storms, so fixes are pooled across members per (storm, lead hour). Returns the
    storms in (basin, storm_number) order plus the single forecast cycle datetime shared by every
    file (None if nothing loaded).
    """
    storms_by_identity: dict[tuple[str, str], _StormFixesByLeadHour] = {}
    forecast_cycle_datetime: datetime | None = None

    for path in gefs_track_member_paths:
        if not os.path.exists(path):
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS track file not found, skipping: {path}",
            )
            continue

        parsed = _parse_gefs_track_path(path)
        if parsed is None:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized GEFS track file path, skipping: {path}",
            )
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime
        elif parsed.cycle_datetime != forecast_cycle_datetime:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS track file from different forecast cycle ({parsed.cycle_datetime}) "
                f"than expected ({forecast_cycle_datetime}), skipping: {path}",
            )
            continue

        nrw_logger.log_info(
            logger,
            nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
            f"Extracting track fixes from {path}",
        )
        for row in _read_track_fixes(path, bounds):
            storm = storms_by_identity.setdefault(
                (row.basin, row.storm_number),
                _StormFixesByLeadHour(
                    basin=row.basin,
                    storm_number=row.storm_number,
                    fixes_by_lead_hour={},
                ),
            )
            storm.fixes_by_lead_hour.setdefault(row.lead_hour, []).append(row.track_fix)

    ordered_storms = [
        storms_by_identity[identity] for identity in sorted(storms_by_identity)
    ]
    return ordered_storms, forecast_cycle_datetime


def _build_time_interval_track_fixes(
    fixes_by_lead_hour: dict[int, list[TrackFix]],
    forecast_cycle_datetime: datetime,
    fix_interval_hours: int,
) -> list[TimeIntervalTrackFix]:
    """
    Source-agnostic tail: turn a {lead_hour: [TrackFix, ...]} map into lead-hour-sorted
    TimeIntervalTrackFix buckets. `fix_interval_hours` is the source's own fix cadence (GEFS 6h,
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
    ).replace(tzinfo=timezone.utc)
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


def _read_track_fixes(path: str, bounds: BoundingBox) -> list[_ParsedTrackFixRow]:
    """
    Parse one ATCF track file (plain comma-separated text, not gzipped). A file holds multiple
    storms (different BASIN/CY) interleaved, so every row keeps the storm it belongs to; grouping
    happens in _load_gefs_track_fixes. Rows are dropped for a non-matching wind-radii threshold
    (each fix repeats 2-3x, once per RAD value), for falling outside `bounds`, and for belonging to
    an ATCF invest (see _is_invest_storm_number).
    """
    min_lon, min_lat, max_lon, max_lat = bounds
    rows: list[_ParsedTrackFixRow] = []

    with open(path) as track_file:
        for line in track_file:
            fields = [field.strip() for field in line.split(",")]
            if len(fields) < 12 or int(fields[11]) != ATCF_WIND_RADII_THRESHOLD_KNOTS:
                continue

            storm_number = fields[1]
            if _is_invest_storm_number(storm_number):
                continue

            latitude = _parse_atcf_coordinate(fields[6], positive_suffix="N")
            longitude = _parse_atcf_coordinate(fields[7], positive_suffix="E")
            if not (min_lon <= longitude <= max_lon and min_lat <= latitude <= max_lat):
                continue

            rows.append(
                _ParsedTrackFixRow(
                    basin=fields[0],
                    storm_number=storm_number,
                    lead_hour=int(fields[5]),
                    track_fix=TrackFix(
                        latitude=latitude,
                        longitude=longitude,
                        max_sustained_wind_knots=float(fields[8]),
                        min_sea_level_pressure_mb=float(fields[9]),
                    ),
                )
            )

    return rows


def _is_invest_storm_number(storm_number: str) -> bool:
    """
    ATCF reserves cyclone numbers 90-99 for "invests" - areas of interest the tracker follows
    before (and unless) they are designated a numbered storm.

    These are dropped rather than alerted on, for two reasons. An invest is renumbered the moment
    it is designated (EP98 becomes EP07), so its identifier is not stable across runs - which the
    per-storm event name in forecast.py depends on. And the tracker emits both rows meanwhile:
    in the gefs.20260724 fixture EP/98 and EP/07 are the same physical storm, 33 fixes each,
    identical at every lead hour but one (0.1 degree of latitude), so keeping invests would raise
    two events for one storm.

    TODO(data-scientist): an invest that threatens a country while never being designated is now
    silently ignored. Whether that early signal is worth the duplicates is a product call.
    """
    return 90 <= int(storm_number) <= 99


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
    ).replace(tzinfo=timezone.utc)
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
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"ECMWF track file not found, skipping: {path}",
            )
            continue

        parsed = _parse_ecmwf_track_path(path)
        if parsed is None:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized ECMWF track file path, skipping: {path}",
            )
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime
        elif parsed.cycle_datetime != forecast_cycle_datetime:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"ECMWF track file from different forecast cycle ({parsed.cycle_datetime}) "
                f"than expected ({forecast_cycle_datetime}), skipping: {path}",
            )
            continue

        nrw_logger.log_info(
            logger,
            nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
            f"Extracting track fixes from {path}",
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


def derive_alert_centroid(
    time_interval_track_fixes: list[TimeIntervalTrackFix],
    time_interval_severities: list[TimeIntervalWindSpeedSeverity],
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> Centroid | None:
    """
    Storm-center point to report for the alert, or None when the peak-intensity wind bucket
    (highest MEDIAN wind speed) starts outside the time window the storm is tracked over - that
    wind cannot be attributed to the tracked storm, and no alert is raised. A peak time exactly on
    either end of the tracked window counts as inside it. Otherwise the reported position is the
    ensemble-mean position of the first track bucket, in time order, lying inside the admin areas,
    or of the bucket coming closest to them when none lies inside.
    """
    if not time_interval_track_fixes or not time_interval_severities:
        return None

    sorted_buckets = sorted(
        time_interval_track_fixes,
        key=lambda bucket: _parse_time_interval_start(bucket.time_interval_start),
    )
    first_track_time = _parse_time_interval_start(sorted_buckets[0].time_interval_start)
    last_track_time = _parse_time_interval_start(sorted_buckets[-1].time_interval_start)

    peak_bucket = max(
        time_interval_severities, key=lambda severity: severity.median_wind_speed
    )
    peak_time = _parse_time_interval_start(peak_bucket.time_interval_start)
    if peak_time < first_track_time or peak_time > last_track_time:
        return None

    return _landfall_or_closest_approach_centroid(
        sorted_buckets, place_codes, admin_areas
    )


def _landfall_or_closest_approach_centroid(
    sorted_buckets: list[TimeIntervalTrackFix],
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> Centroid:
    """
    The ensemble-mean position of the first bucket, in time order, lying inside the admin-area
    union, or of the bucket whose ensemble-mean position is closest to that union when none lies
    inside it. Distances are in degrees and only rank buckets against each other.
    """
    admin_area_union = _admin_area_union(place_codes, admin_areas)
    bucket_centroids = [_bucket_centroid(bucket) for bucket in sorted_buckets]

    for centroid in bucket_centroids:
        if admin_area_union.contains(Point(centroid.longitude, centroid.latitude)):
            return centroid

    return min(
        bucket_centroids,
        key=lambda centroid: admin_area_union.distance(
            Point(centroid.longitude, centroid.latitude)
        ),
    )


def _admin_area_union(
    place_codes: list[str], admin_areas: AdminAreasSet
) -> BaseGeometry:
    """The single geometry covering the given admin areas."""
    return unary_union(
        [
            admin_areas.admin_areas[place_code].to_geometry()
            for place_code in place_codes
            if place_code in admin_areas.admin_areas
        ]
    )


def _parse_time_interval_start(time_interval_start: str) -> datetime:
    return datetime.strptime(time_interval_start, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc
    )


def _bucket_centroid(bucket: TimeIntervalTrackFix) -> Centroid:
    fixes = bucket.ensemble_track_fixes
    return Centroid(
        latitude=fmean(fix.latitude for fix in fixes),
        longitude=fmean(fix.longitude for fix in fixes),
    )


def select_place_codes_near_storm(
    storm_track: StormTrack,
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    buffer_km: float,
) -> list[str]:
    """
    The subset of `place_codes` whose admin area lies within `buffer_km` of this storm's own track,
    in the order given.

    This is what scopes one storm's alert to the part of the country it actually threatens. Every
    concurrent storm is measured against the same country-wide wind raster, so without this subset
    a distant storm would inherit the severity and exposure of one making landfall. Returns an
    empty list when the storm comes nowhere near the given areas - callers must skip that storm
    rather than clip to nothing, since clip_raster_to_admin_areas falls back to the *unclipped*
    raster when it is given no geometries.
    """
    storm_bounds = pad_bounding_box(_storm_bounding_box(storm_track), buffer_km)
    min_lon, min_lat, max_lon, max_lat = storm_bounds
    storm_box = box(min_lon, min_lat, max_lon, max_lat)

    return [
        place_code
        for place_code in place_codes
        if place_code in admin_areas.admin_areas
        and storm_box.intersects(admin_areas.admin_areas[place_code].to_geometry())
    ]


def _storm_bounding_box(storm_track: StormTrack) -> BoundingBox:
    """
    The (min_lon, min_lat, max_lon, max_lat) box around every ensemble fix of every bucket - the
    whole forecast track, not just its current or peak position, so an area is counted as near the
    storm if any plausible member passes it at any point in the window.
    """
    latitudes = [
        fix.latitude
        for bucket in storm_track.time_interval_track_fixes
        for fix in bucket.ensemble_track_fixes
    ]
    longitudes = [
        fix.longitude
        for bucket in storm_track.time_interval_track_fixes
        for fix in bucket.ensemble_track_fixes
    ]
    return (min(longitudes), min(latitudes), max(longitudes), max(latitudes))


def find_storm_pairs_sharing_place_codes(
    storm_tracks: list[StormTrack],
    place_codes_per_storm: list[list[str]],
) -> list[tuple[str, str]]:
    """
    Pairs of storm identifiers that were scoped to at least one admin area in common, each pair
    reported once.

    Sharing an admin area means its population is reported as exposed under both storms' events, so
    the two figures cannot be summed. Returning the pairs rather than logging them keeps this
    function pure; the caller decides how loudly to report it.
    """
    return [
        (
            storm_tracks[first].storm_identifier,
            storm_tracks[second].storm_identifier,
        )
        for first in range(len(storm_tracks))
        for second in range(first + 1, len(storm_tracks))
        if set(place_codes_per_storm[first]) & set(place_codes_per_storm[second])
    ]
