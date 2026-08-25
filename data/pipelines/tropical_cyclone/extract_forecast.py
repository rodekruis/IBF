from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from itertools import pairwise

import numpy as np
import xarray as xr
from rasterio.transform import Affine

from pipelines.infra.data_types.enums import ForecastSource
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils import nrw_logger
from pipelines.infra.utils.raster import BoundingBox
from pipelines.tropical_cyclone import constants

logger = logging.getLogger(__name__)


@dataclass
class TimeIntervalWindSpeed:
    time_interval_start: str
    time_interval_end: str
    ensemble_wind_speed_rasters: list[RasterData]


def extract_wind_speed(
    wind_member_paths: list[str],
    bounds: BoundingBox,
    country_config: constants.CountryConfig,
    temporal_extent: dict[str, list],
) -> list[TimeIntervalWindSpeed]:
    """
    Read a country's forecast-source 10 m wind into a sustained wind-speed raster per ensemble
    member, sliced to `bounds`, bucketed per `temporal_extent`'s "lead-time-spectrum" (e.g.
    {"lead-time-spectrum": ["0-hour", "3-hour", ..., "168-hour"]} - see AlertConfig).

    Dispatches on country_config.forecast_source to the source-specific loader, because GEFS and
    ECMWF package their ensemble wind completely differently (one GRIB2 file per member per lead
    time for GEFS vs one file holding the whole ensemble step, members addressed by GRIB `number`,
    for ECMWF - see _load_gefs_wind_rasters / _load_ecmwf_wind_rasters). Everything downstream of a
    populated {(member, lead_hour): raster} map is source-agnostic (see
    _build_time_interval_wind_speeds). Each source's native cadence is fixed
    regardless of what the spectrum configures: when the configured interval is a coarser multiple
    of it, multiple native-step rasters are combined per bucket via a per-cell, nodata-aware max
    (see `_aggregate_bucket_rasters`) - the same precautionary-envelope approach already used
    across ensemble members elsewhere in this hazard's logic.

    Applies the resolved averaging-period conversion factor: 1.0 if the country's sustained-wind
    convention is already TEN_MINUTE, otherwise WMO_HARPER_10MIN_TO_1MIN_FACTOR[exposure_class]
    to convert the source's assumed 10-minute-equivalent native wind into the country's own
    ONE_MINUTE convention.
    """
    conversion_factor = _resolve_conversion_factor(country_config)
    lead_hour_spectrum = _parse_lead_hour_spectrum(temporal_extent)
    max_lead_hour = lead_hour_spectrum[-1]

    if country_config.forecast_source == ForecastSource.GEFS:
        native_step_hours = constants.GEFS_NATIVE_LEAD_TIME_STEP_HOURS
        rasters_by_member_and_lead_hour, forecast_cycle_datetime = (
            _load_gefs_wind_rasters(
                wind_member_paths, bounds, conversion_factor, max_lead_hour
            )
        )
    elif country_config.forecast_source == ForecastSource.ECMWF:
        native_step_hours = constants.ECMWF_NATIVE_LEAD_TIME_STEP_HOURS
        rasters_by_member_and_lead_hour, forecast_cycle_datetime = (
            _load_ecmwf_wind_rasters(
                wind_member_paths, bounds, conversion_factor, max_lead_hour
            )
        )
    else:
        raise ValueError(
            f"Unsupported forecast source for wind extraction: "
            f"{country_config.forecast_source}"
        )

    if forecast_cycle_datetime is None:
        return []

    return _build_time_interval_wind_speeds(
        rasters_by_member_and_lead_hour,
        forecast_cycle_datetime,
        lead_hour_spectrum,
        native_step_hours,
    )


def _load_gefs_wind_rasters(
    gefs_wind_member_paths: list[str],
    bounds: BoundingBox,
    conversion_factor: float,
    max_lead_hour: int,
) -> tuple[dict[tuple[str, int], RasterData], datetime | None]:
    """
    Load GEFS 10 m U/V wind into a {(member, lead_hour): sustained-wind raster} map. GEFS ships one
    GRIB2 file per member per lead time, so each path contributes exactly one (member, lead_hour)
    raster - the member code is parsed straight from the filename (see _parse_gefs_wind_path).
    Returns the map plus the single forecast cycle datetime shared by every file (None if nothing
    loaded, which halts the pipeline at extract_wind_speed's guard).
    """
    rasters_by_member_and_lead_hour: dict[tuple[str, int], RasterData] = {}
    forecast_cycle_datetime: datetime | None = None

    for path in gefs_wind_member_paths:
        if not os.path.exists(path):
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS wind file not found, skipping: {path}",
            )
            continue

        parsed = _parse_gefs_wind_path(path)
        if parsed is None:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized GEFS wind file path, skipping: {path}",
            )
            continue

        if parsed.lead_hour > max_lead_hour:
            # GEFS provides lead hours beyond what the configured temporal extent needs (e.g. out
            # to f240); not an error, just outside the requested window.
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime
        elif parsed.cycle_datetime != forecast_cycle_datetime:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS wind file from different forecast cycle ({parsed.cycle_datetime}) "
                f"than expected ({forecast_cycle_datetime}), skipping: {path}",
            )
            continue

        nrw_logger.log_info(
            logger,
            nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
            f"Extracting wind speed from {path}",
        )
        wind_speed_raster = _read_wind_speed_raster(path, bounds)
        wind_speed_raster.array = _scale_excluding_nodata(
            wind_speed_raster.array, wind_speed_raster.nodata, conversion_factor
        )
        rasters_by_member_and_lead_hour[(parsed.member, parsed.lead_hour)] = (
            wind_speed_raster
        )

    return rasters_by_member_and_lead_hour, forecast_cycle_datetime


def _build_time_interval_wind_speeds(
    rasters_by_member_and_lead_hour: dict[tuple[str, int], RasterData],
    forecast_cycle_datetime: datetime,
    lead_hour_spectrum: list[int],
    native_step_hours: int,
) -> list[TimeIntervalWindSpeed]:
    """
    Source-agnostic tail shared by every forecast source: bucket a populated
    {(member, lead_hour): raster} map into the configured lead-time spectrum. `native_step_hours`
    is the loading source's own cadence, used to validate the configured bucket width against it
    (see _resolve_configured_interval_hours); the per-bucket aggregation itself is cadence-agnostic
    (see _aggregate_bucket_rasters).
    """
    configured_interval_hours = _resolve_configured_interval_hours(
        lead_hour_spectrum, native_step_hours
    )

    time_interval_wind_speeds: list[TimeIntervalWindSpeed] = []
    for bucket_start_hour in lead_hour_spectrum:
        bucket_rasters = _aggregate_bucket_rasters(
            rasters_by_member_and_lead_hour,
            bucket_start_hour,
            configured_interval_hours,
        )
        if not bucket_rasters:
            continue
        time_interval_start, time_interval_end = _lead_hour_to_time_interval(
            forecast_cycle_datetime, bucket_start_hour, configured_interval_hours
        )
        time_interval_wind_speeds.append(
            TimeIntervalWindSpeed(
                time_interval_start=time_interval_start,
                time_interval_end=time_interval_end,
                ensemble_wind_speed_rasters=bucket_rasters,
            )
        )

    return time_interval_wind_speeds


def _resolve_conversion_factor(country_config: constants.CountryConfig) -> float:
    period = country_config.sustained_wind_averaging_period
    if period == constants.AveragingPeriod.TEN_MINUTE:
        return 1.0
    if period == constants.AveragingPeriod.ONE_MINUTE:
        return constants.WMO_HARPER_10MIN_TO_1MIN_FACTOR[country_config.exposure_class]
    raise NotImplementedError(
        f"No 10-minute-to-{period} sustained-wind conversion factor is defined; only "
        f"ONE_MINUTE and TEN_MINUTE conventions are supported. A THREE_MINUTE convention "
        f"(e.g. IMD / North Indian Ocean) would need its own WMO/Harper factor table."
    )


def _scale_excluding_nodata(
    array: np.ndarray, nodata: float, conversion_factor: float
) -> np.ndarray:
    """Multiplies non-nodata cells by conversion_factor; nodata cells stay unchanged."""
    scaled = np.ma.masked_equal(array, nodata) * np.float32(conversion_factor)
    return scaled.filled(nodata).astype(np.float32)


# Matches NOAA's NOMADS/AWS-S3 GEFS wind path layout, confirmed against real files in the
# public noaa-gefs-pds S3 bucket:
#   gefs.<YYYYMMDD>/<HH>/atmos/pgrb2sp25/<member>.t<HH>z.pgrb2s.0p25.f<FFF>
# <member> is the ensemble member code (gec00 = control, gep01..gep30 = 30 perturbed members);
# <HH> is the forecast cycle hour (00/06/12/18 UTC); <FFF> is the lead hour, zero-padded
# (f000..f240, native 3h step).
_GEFS_WIND_PATH_PATTERN = re.compile(
    r"gefs\.(?P<date>\d{8})/(?P<cycle_hour>\d{2})/atmos/pgrb2sp25/"
    r"(?P<member>ge[cp]\d{2})\.t\d{2}z\.pgrb2s\.0p25\.f(?P<lead_hour>\d{3})$"
)


@dataclass
class _ParsedGefsWindPath:
    cycle_datetime: datetime
    member: str
    lead_hour: int


def _parse_gefs_wind_path(path: str) -> _ParsedGefsWindPath | None:
    match = _GEFS_WIND_PATH_PATTERN.search(path.replace("\\", "/"))
    if match is None:
        return None
    cycle_datetime = datetime.strptime(
        match.group("date") + match.group("cycle_hour"), "%Y%m%d%H"
    ).replace(tzinfo=timezone.utc)
    return _ParsedGefsWindPath(
        cycle_datetime=cycle_datetime,
        member=match.group("member"),
        lead_hour=int(match.group("lead_hour")),
    )


def _parse_lead_hour_spectrum(temporal_extent: dict[str, list]) -> list[int]:
    """Parse a tropical-cyclone temporal extent into a sorted list of lead hours.

    Expects {"lead-time-spectrum": ["0-hour", "3-hour", ..., "168-hour"]} (mirrors flood's
    day-based spectrum, see flood/extract_forecast.py's `_parse_lead_time_range`) and returns
    [0, 3, ..., 168] for that example.
    """
    spectrum = temporal_extent.get("lead-time-spectrum")
    if not spectrum:
        raise ValueError(
            f"Temporal extent missing 'lead-time-spectrum': {temporal_extent}"
        )
    return sorted(int(entry.split("-")[0]) for entry in spectrum)


def _resolve_configured_interval_hours(
    lead_hour_spectrum: list[int],
    native_step_hours: int,
) -> int:
    """
    The output bucket width, derived from the spectrum's own spacing rather than assumed - so a
    future change to the alert config (e.g. 3-hour -> 6-hour steps) is picked up automatically
    without a code change here. Falls back to the loading source's native cadence
    (`native_step_hours`) for a single-point spectrum, where no spacing can be derived.
    """
    if len(lead_hour_spectrum) < 2:
        return native_step_hours

    deltas = {b - a for a, b in pairwise(lead_hour_spectrum)}
    if len(deltas) > 1 or min(deltas) <= 0:
        raise ValueError(
            f"Lead-hour spectrum must be strictly increasing with constant spacing: {lead_hour_spectrum}"
        )
    interval_hours = deltas.pop()
    if interval_hours % native_step_hours != 0:
        raise ValueError(
            f"Lead-hour spectrum interval must be a multiple of the native "
            f"{native_step_hours}h step: {interval_hours}h"
        )
    return interval_hours


def _aggregate_bucket_rasters(
    rasters_by_member_and_lead_hour: dict[tuple[str, int], RasterData],
    bucket_start_hour: int,
    interval_hours: int,
) -> list[RasterData]:
    """
    Per ensemble member, combine every native raster whose lead hour falls inside
    [bucket_start_hour, bucket_start_hour + interval_hours) into one raster for this bucket, via a
    per-cell nodata-aware max (see _envelope_max). Rasters are collected by window membership rather
    than by stepping a fixed native cadence, so this stays correct where a source's cadence changes
    mid-forecast - e.g. ECMWF ENS wind is 3-hourly to 144h then 6-hourly. A no-op (single raster
    passed through) when only one native step falls in the bucket, the common case today. Members
    with no raster in the window are skipped (matches the missing-file tolerance elsewhere here).
    """
    bucket_end_hour = bucket_start_hour + interval_hours
    rasters_by_member: dict[str, list[RasterData]] = {}
    for (member, lead_hour), raster in rasters_by_member_and_lead_hour.items():
        if bucket_start_hour <= lead_hour < bucket_end_hour:
            rasters_by_member.setdefault(member, []).append(raster)
    return [_envelope_max(rasters) for _, rasters in sorted(rasters_by_member.items())]


def _envelope_max(rasters: list[RasterData]) -> RasterData:
    """Per-cell max across same-grid rasters, nodata-aware (a cell stays nodata only if it is
    nodata in every input) - same precautionary-envelope approach as compute_wind_spatial_extent.py's
    per-member footprint, applied here across a single member's native lead-time steps instead of
    across members."""
    if len(rasters) == 1:
        return rasters[0]
    reference = rasters[0]
    stacked = np.stack([raster.array for raster in rasters])
    envelope = (
        np.ma.masked_equal(stacked, reference.nodata)
        .max(axis=0)
        .filled(reference.nodata)
    )
    return RasterData(
        array=envelope.astype(np.float32),
        transform=reference.transform,
        crs=reference.crs,
        nodata=reference.nodata,
    )


def _lead_hour_to_time_interval(
    forecast_cycle_datetime: datetime, lead_hour: int, interval_hours: int
) -> tuple[str, str]:
    interval_start = forecast_cycle_datetime + timedelta(hours=lead_hour)
    interval_end = interval_start + timedelta(hours=interval_hours)
    return (
        interval_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        interval_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def _slice_to_bounds(dataset: xr.Dataset, bounds: BoundingBox) -> xr.Dataset:
    """
    Slice a wind dataset to `bounds` (a -180/180 min_lon/min_lat/max_lon/max_lat box). cfgrib
    presents longitude in whichever convention the source encodes - 0-360 for some (e.g. NOAA GEFS)
    or -180..180 for others (e.g. ECMWF IFS, verified against a real 0p25 file) - so the slice is
    matched to the dataset's own convention rather than assuming 0-360 (which silently returned an
    empty selection for a western-hemisphere bounds on a -180/180 dataset). `_build_wind_speed_raster`
    still emits a -180/180 transform either way. Assumes latitude descending and a bounds box that
    does not cross the antimeridian/prime meridian (true for PHL/KNA/DMA/ATG).
    """
    min_lon, min_lat, max_lon, max_lat = bounds
    dataset_uses_0_360 = float(dataset["longitude"].max()) > 180
    west, east = (
        (min_lon % 360, max_lon % 360) if dataset_uses_0_360 else (min_lon, max_lon)
    )
    return dataset.sel(
        latitude=slice(max_lat, min_lat),
        longitude=slice(west, east),
    )


def _read_wind_speed_raster(path: str, bounds: BoundingBox) -> RasterData:
    """
    Read a single GEFS 10 m U/V wind GRIB2 file (one ensemble member) into a sustained wind-speed
    raster. GEFS ships each member in its own file, so there is no ensemble dimension to unpack
    here (contrast _read_ecmwf_wind_speed_rasters). The slice/grid/transform handling is shared
    with ECMWF via _slice_to_bounds and _build_wind_speed_raster.
    """
    with xr.open_dataset(
        path,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {"typeOfLevel": "heightAboveGround", "level": 10}
        },
    ) as dataset:
        sliced = _slice_to_bounds(dataset, bounds)
        nodata = float(sliced["u10"].attrs["GRIB_missingValue"])
        u_wind = sliced["u10"].to_numpy().astype(np.float32)
        v_wind = sliced["v10"].to_numpy().astype(np.float32)
        latitudes = sliced["latitude"].to_numpy()
        longitudes = sliced["longitude"].to_numpy()

    return _build_wind_speed_raster(u_wind, v_wind, nodata, latitudes, longitudes)


def _build_wind_speed_raster(
    u_wind: np.ndarray,
    v_wind: np.ndarray,
    nodata: float,
    latitudes: np.ndarray,
    longitudes: np.ndarray,
) -> RasterData:
    """
    Combine 10 m U/V components into one sustained wind-speed raster (magnitude sqrt(u^2 + v^2),
    nodata-preserving) with a north-up affine transform. Shared by the GEFS and ECMWF wind readers.
    The input longitudes may be 0-360 (some sources) or -180..180 (others, e.g. ECMWF - see
    _slice_to_bounds); either way the emitted transform is normalised to -180/180 (the `west - 360`
    step only fires for a 0-360 source). Assumes latitudes descending, longitudes ascending, and a
    bounds box that does not straddle the antimeridian.
    """
    missing_mask = (
        (u_wind == nodata)
        | (v_wind == nodata)
        | ~np.isfinite(u_wind)
        | ~np.isfinite(v_wind)
    )
    wind_speed = np.sqrt(u_wind**2 + v_wind**2).astype(np.float32)
    wind_speed[missing_mask] = nodata

    x_res = float(longitudes[1] - longitudes[0])
    y_res = float(latitudes[0] - latitudes[1])
    west = float(longitudes[0]) - x_res / 2
    west = west - 360 if west > 180 else west
    north = float(latitudes[0]) + y_res / 2
    transform = Affine(x_res, 0, west, 0, -y_res, north)

    return RasterData(
        array=wind_speed,
        transform=transform,
        crs="EPSG:4326",
        nodata=nodata,
    )


# Matches ECMWF's open-data IFS wind path layout (confirmed against real downloaded files), e.g.
#   <YYYYMMDD>/<HH>z/ifs/0p25/<stream>/<YYYYMMDD><HH>0000-<step>h-<stream>-<type>.grib2
# <stream> is `oper` (single control forecast, <type> `fc`) or `enfo` (all 50 perturbed members in
# one file, <type> `ef`, member selected via the GRIB `number` key); <step> is the lead hour (not
# zero-padded, e.g. 6, 144, 360).
_ECMWF_WIND_PATH_PATTERN = re.compile(
    r"(?P<date>\d{8})/(?P<cycle_hour>\d{2})z/ifs/0p25/(?P<stream>oper|enfo)/"
    r"\d{8}\d{2}0000-(?P<lead_hour>\d+)h-(?P=stream)-(?:fc|ef)\.grib2$"
)


@dataclass
class _ParsedEcmwfWindPath:
    cycle_datetime: datetime
    stream: str
    lead_hour: int


def _parse_ecmwf_wind_path(path: str) -> _ParsedEcmwfWindPath | None:
    match = _ECMWF_WIND_PATH_PATTERN.search(path.replace("\\", "/"))
    if match is None:
        return None
    cycle_datetime = datetime.strptime(
        match.group("date") + match.group("cycle_hour"), "%Y%m%d%H"
    ).replace(tzinfo=timezone.utc)
    return _ParsedEcmwfWindPath(
        cycle_datetime=cycle_datetime,
        stream=match.group("stream"),
        lead_hour=int(match.group("lead_hour")),
    )


def _load_ecmwf_wind_rasters(
    ecmwf_wind_member_paths: list[str],
    bounds: BoundingBox,
    conversion_factor: float,
    max_lead_hour: int,
) -> tuple[dict[tuple[str, int], RasterData], datetime | None]:
    """
    Load ECMWF IFS 10 m wind into a {(member, lead_hour): sustained-wind raster} map. Unlike GEFS's
    one-file-per-member layout, ECMWF packs a whole ensemble step into one file: an `enfo` file
    holds all 50 perturbed members (addressed by the GRIB `number` key), while the single control
    member lives in a separate `oper` file. So each path can contribute up to 50 members for one
    lead hour (see _read_ecmwf_wind_speed_rasters). Members are keyed by a stream-scoped id
    ("control" for oper, the zero-padded perturbed number for enfo) so envelope aggregation stays
    per-member. Returns the map plus the single shared forecast cycle datetime (None if nothing
    loaded).
    """
    rasters_by_member_and_lead_hour: dict[tuple[str, int], RasterData] = {}
    forecast_cycle_datetime: datetime | None = None

    for path in ecmwf_wind_member_paths:
        if not os.path.exists(path):
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"ECMWF wind file not found, skipping: {path}",
            )
            continue

        parsed = _parse_ecmwf_wind_path(path)
        if parsed is None:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized ECMWF wind file path, skipping: {path}",
            )
            continue

        if parsed.lead_hour > max_lead_hour:
            # ECMWF provides lead hours beyond what the configured temporal extent needs (out to
            # 360h); not an error, just outside the requested window.
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime
        elif parsed.cycle_datetime != forecast_cycle_datetime:
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"ECMWF wind file from different forecast cycle ({parsed.cycle_datetime}) "
                f"than expected ({forecast_cycle_datetime}), skipping: {path}",
            )
            continue

        nrw_logger.log_info(
            logger,
            nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
            f"Extracting wind speed from {path}",
        )
        member_rasters = _read_ecmwf_wind_speed_rasters(path, bounds, parsed.stream)
        for member, wind_speed_raster in member_rasters.items():
            wind_speed_raster.array = _scale_excluding_nodata(
                wind_speed_raster.array, wind_speed_raster.nodata, conversion_factor
            )
            rasters_by_member_and_lead_hour[(member, parsed.lead_hour)] = (
                wind_speed_raster
            )

    return rasters_by_member_and_lead_hour, forecast_cycle_datetime


def _read_ecmwf_wind_speed_rasters(
    path: str, bounds: BoundingBox, stream: str
) -> dict[str, RasterData]:
    """
    Read one ECMWF IFS wind GRIB2 file into a {member_id: sustained-wind raster} map. An `enfo`
    file carries a `number` dimension (perturbed members 1..50, each yielding one raster); an
    `oper` file is a single control field with no ensemble dimension (one "control" raster). Both
    decode 10 m U/V as u10/v10 on a 0.25-degree grid (cfgrib presents ECMWF's longitude in
    -180..180; see _slice_to_bounds), so the raster build is shared (see _build_wind_speed_raster).

    """
    member_rasters: dict[str, RasterData] = {}

    with xr.open_dataset(
        path,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {"typeOfLevel": "heightAboveGround", "level": 10}
        },
    ) as dataset:
        sliced = _slice_to_bounds(dataset, bounds)
        nodata = float(sliced["u10"].attrs["GRIB_missingValue"])
        latitudes = sliced["latitude"].to_numpy()
        longitudes = sliced["longitude"].to_numpy()

        if stream == constants.ECMWF_STREAM_PERTURBED:
            for member_number in np.atleast_1d(sliced["number"].to_numpy()):
                member = sliced.sel(number=member_number)
                member_rasters[f"{int(member_number):02d}"] = _build_wind_speed_raster(
                    member["u10"].to_numpy().astype(np.float32),
                    member["v10"].to_numpy().astype(np.float32),
                    nodata,
                    latitudes,
                    longitudes,
                )
        else:
            member_rasters["control"] = _build_wind_speed_raster(
                sliced["u10"].to_numpy().astype(np.float32),
                sliced["v10"].to_numpy().astype(np.float32),
                nodata,
                latitudes,
                longitudes,
            )

    return member_rasters
