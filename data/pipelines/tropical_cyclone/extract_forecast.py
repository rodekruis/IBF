from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import xarray as xr
from rasterio.transform import Affine

from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.nrw_logger import log_info, log_warning, LogTag
from pipelines.infra.utils.raster import BoundingBox
from pipelines.tropical_cyclone.constants import (
    AveragingPeriod,
    CountryConfig,
    WMO_HARPER_10MIN_TO_1MIN_FACTOR,
)

logger = logging.getLogger(__name__)


@dataclass
class TimeIntervalWindSpeed:
    time_interval_start: str
    time_interval_end: str
    ensemble_wind_speed_rasters: list[RasterData]


def extract_wind_speed(
    gefs_wind_member_paths: list[str],
    bounds: BoundingBox,
    country_config: CountryConfig,
) -> list[TimeIntervalWindSpeed]:
    """
    Read GEFS 10 m U/V wind (one GRIB2 file per member per lead time) into a sustained wind-speed
    raster per ensemble member per native 3h lead-time step, sliced to `bounds`.

    Applies the resolved averaging-period conversion factor: 1.0 if the country's sustained-wind
    convention is already TEN_MINUTE (e.g. PHL/PAGASA - no correction needed), otherwise
    WMO_HARPER_10MIN_TO_1MIN_FACTOR[exposure_class] to convert GEFS's assumed 10-minute-equivalent
    native wind into the country's own ONE_MINUTE convention (e.g. KNA/DMA/ATG/NHC).
    """
    conversion_factor = _resolve_conversion_factor(country_config)
    rasters_by_lead_hour: dict[int, list[RasterData]] = {}
    forecast_cycle_datetime: datetime | None = None

    for path in gefs_wind_member_paths:
        if not os.path.exists(path):
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"GEFS wind file not found, skipping: {path}",
            )
            continue

        parsed = _parse_gefs_wind_path(path)
        if parsed is None:
            log_warning(
                logger,
                LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Unrecognized GEFS wind file path, skipping: {path}",
            )
            continue

        if forecast_cycle_datetime is None:
            forecast_cycle_datetime = parsed.cycle_datetime

        log_info(
            logger, LogTag.TROPICAL_CYCLONE_LOGIC, f"Extracting wind speed from {path}"
        )
        wind_speed_raster = _read_wind_speed_raster(path, bounds)
        wind_speed_raster.array = wind_speed_raster.array * conversion_factor
        rasters_by_lead_hour.setdefault(parsed.lead_hour, []).append(wind_speed_raster)

    if forecast_cycle_datetime is None:
        return []

    return [
        TimeIntervalWindSpeed(
            time_interval_start=time_interval_start,
            time_interval_end=time_interval_end,
            ensemble_wind_speed_rasters=rasters_by_lead_hour[lead_hour],
        )
        for lead_hour in sorted(rasters_by_lead_hour)
        for time_interval_start, time_interval_end in [
            _lead_hour_to_time_interval(forecast_cycle_datetime, lead_hour)
        ]
    ]


def _resolve_conversion_factor(country_config: CountryConfig) -> float:
    if country_config.sustained_wind_averaging_period == AveragingPeriod.TEN_MINUTE:
        return 1.0
    return WMO_HARPER_10MIN_TO_1MIN_FACTOR[country_config.exposure_class]


# Matches NOAA's NOMADS/AWS-S3 GEFS wind path layout, confirmed against real files in the
# public noaa-gefs-pds S3 bucket:
#   gefs.<YYYYMMDD>/<HH>/atmos/pgrb2sp25/<member>.t<HH>z.pgrb2s.0p25.f<FFF>
# <member> is the ensemble member code (gec00 = control, gep01..gep30 = 30 perturbed members);
# <HH> is the forecast cycle hour (00/06/12/18 UTC); <FFF> is the lead hour, zero-padded
# (f000..f240, native 3h step).
_GEFS_WIND_PATH_PATTERN = re.compile(
    r"gefs\.(?P<date>\d{8})/(?P<cycle_hour>\d{2})/atmos/pgrb2sp25/"
    r"ge[cp]\d{2}\.t\d{2}z\.pgrb2s\.0p25\.f(?P<lead_hour>\d{3})$"
)


@dataclass
class _ParsedGefsWindPath:
    cycle_datetime: datetime
    lead_hour: int


def _parse_gefs_wind_path(path: str) -> _ParsedGefsWindPath | None:
    match = _GEFS_WIND_PATH_PATTERN.search(path.replace("\\", "/"))
    if match is None:
        return None
    cycle_datetime = datetime.strptime(
        match.group("date") + match.group("cycle_hour"), "%Y%m%d%H"
    )
    return _ParsedGefsWindPath(
        cycle_datetime=cycle_datetime, lead_hour=int(match.group("lead_hour"))
    )


def _lead_hour_to_time_interval(
    forecast_cycle_datetime: datetime, lead_hour: int
) -> tuple[str, str]:
    interval_start = forecast_cycle_datetime + timedelta(hours=lead_hour)
    interval_end = interval_start + timedelta(hours=3)
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
