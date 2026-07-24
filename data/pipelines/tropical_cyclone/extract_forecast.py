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
    gefs_wind_member_paths: list[str],
    bounds: BoundingBox,
    country_config: constants.CountryConfig,
    temporal_extent: dict[str, list],
) -> list[TimeIntervalWindSpeed]:
    """
    Read GEFS 10 m U/V wind (one GRIB2 file per member per lead time) into a sustained wind-speed
    raster per ensemble member, sliced to `bounds`, bucketed per `temporal_extent`'s
    "lead-time-spectrum" (e.g. {"lead-time-spectrum": ["0-hour", "3-hour", ..., "168-hour"]} - see
    AlertConfig). GEFS's own native cadence (GEFS_NATIVE_LEAD_TIME_STEP_HOURS, currently 3h) is
    fixed regardless of what the spectrum configures: when the configured interval is a coarser
    multiple of it, multiple native-step rasters are combined per bucket via a per-cell,
    nodata-aware max (see `_aggregate_bucket_rasters`) - the same precautionary-envelope approach
    already used across ensemble members elsewhere in this hazard's logic.

    Applies the resolved averaging-period conversion factor: 1.0 if the country's sustained-wind
    convention is already TEN_MINUTE (e.g. PHL/PAGASA - no correction needed), otherwise
    WMO_HARPER_10MIN_TO_1MIN_FACTOR[exposure_class] to convert GEFS's assumed 10-minute-equivalent
    native wind into the country's own ONE_MINUTE convention (e.g. KNA/DMA/ATG/NHC).
    """
    conversion_factor = _resolve_conversion_factor(country_config)
    lead_hour_spectrum = _parse_lead_hour_spectrum(temporal_extent)
    configured_interval_hours = _resolve_configured_interval_hours(lead_hour_spectrum)
    max_lead_hour = lead_hour_spectrum[-1]

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

    if forecast_cycle_datetime is None:
        return []

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
    if (
        country_config.sustained_wind_averaging_period
        == constants.AveragingPeriod.TEN_MINUTE
    ):
        return 1.0
    return constants.WMO_HARPER_10MIN_TO_1MIN_FACTOR[country_config.exposure_class]


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


def _resolve_configured_interval_hours(lead_hour_spectrum: list[int]) -> int:
    """
    The output bucket width, derived from the spectrum's own spacing rather than assumed - so a
    future change to the alert config (e.g. 3-hour -> 6-hour steps) is picked up automatically
    without a code change here. Falls back to GEFS's native cadence for a single-point spectrum,
    where no spacing can be derived.

    TODO-infra: PR #306 discussion (comment on this function) - consider validating a config's
    lead-hour spacing against its data source's native cadence at the API layer too (AlertConfig
    has no forecastSource link yet, ForecastSource has no cadence attached). Flood has no
    equivalent check today, so that's the natural place to start. Keep this check here regardless
    - it protects _aggregate_bucket_rasters below, and removing it fails silently, not loudly.
    """
    if len(lead_hour_spectrum) < 2:
        return constants.GEFS_NATIVE_LEAD_TIME_STEP_HOURS

    deltas = {b - a for a, b in pairwise(lead_hour_spectrum)}
    if len(deltas) > 1 or min(deltas) <= 0:
        raise ValueError(
            f"Lead-hour spectrum must be strictly increasing with constant spacing: {lead_hour_spectrum}"
        )
    interval_hours = deltas.pop()
    if interval_hours % constants.GEFS_NATIVE_LEAD_TIME_STEP_HOURS != 0:
        raise ValueError(
            f"Lead-hour spectrum interval must be a multiple of GEFS's native "
            f"{constants.GEFS_NATIVE_LEAD_TIME_STEP_HOURS}h step: {interval_hours}h"
        )
    return interval_hours


def _aggregate_bucket_rasters(
    rasters_by_member_and_lead_hour: dict[tuple[str, int], RasterData],
    bucket_start_hour: int,
    interval_hours: int,
) -> list[RasterData]:
    """
    Per ensemble member, collect every native-step raster falling inside
    [bucket_start_hour, bucket_start_hour + interval_hours) and combine them into one raster for
    this bucket. A no-op (single native raster passed through as-is) whenever interval_hours equals
    GEFS_NATIVE_LEAD_TIME_STEP_HOURS - the common case today. Members missing all native rasters for
    this bucket are skipped (matches the existing missing-file tolerance elsewhere in this module).
    """
    members = sorted({member for member, _ in rasters_by_member_and_lead_hour})
    bucket_rasters: list[RasterData] = []
    for member in members:
        native_rasters = [
            rasters_by_member_and_lead_hour[(member, native_lead_hour)]
            for native_lead_hour in range(
                bucket_start_hour,
                bucket_start_hour + interval_hours,
                constants.GEFS_NATIVE_LEAD_TIME_STEP_HOURS,
            )
            if (member, native_lead_hour) in rasters_by_member_and_lead_hour
        ]
        if not native_rasters:
            continue
        bucket_rasters.append(_envelope_max(native_rasters))
    return bucket_rasters


def _envelope_max(rasters: list[RasterData]) -> RasterData:
    """Per-cell max across same-grid rasters, nodata-aware (a cell stays nodata only if it is
    nodata in every input) - same precautionary-envelope approach as compute_wind_extent.py's
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


def _read_wind_speed_raster(path: str, bounds: BoundingBox) -> RasterData:
    """
    GEFS/GFS grids use a 0-360 longitude convention; every other bound/geometry in this pipeline
    uses -180/180, so bounds are converted only at this boundary. Doesn't handle a bounds box that
    straddles the antimeridian - not needed for PHL/KNA/DMA/ATG.
    """
    min_lon, min_lat, max_lon, max_lat = bounds

    with xr.open_dataset(
        path,
        engine="cfgrib",
        backend_kwargs={
            "filter_by_keys": {"typeOfLevel": "heightAboveGround", "level": 10}
        },
    ) as dataset:
        sliced = dataset.sel(
            latitude=slice(max_lat, min_lat),
            longitude=slice(min_lon % 360, max_lon % 360),
        )
        nodata = float(sliced["u10"].attrs["GRIB_missingValue"])
        u_wind = sliced["u10"].to_numpy().astype(np.float32)
        v_wind = sliced["v10"].to_numpy().astype(np.float32)
        latitudes = sliced["latitude"].to_numpy()
        longitudes = sliced["longitude"].to_numpy()

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
