from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import rasterio

from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.flood.utils_raster import BoundingBox, slice_netcdf_to_bounds


@dataclass
class LeadTimeDischarge:
    time_interval_start: str
    time_interval_end: str
    ensemble_discharges: list[float]


# { station_code: [lead_time_discharge] }
StationDischarges = dict[str, list[LeadTimeDischarge]]

LEAD_TIME_MAX = 8


def _extract_forecast_base_datetime(netcdf_path: str) -> datetime:
    """Extract forecast run datetime from a file name like dis_00_2026040800.nc."""
    basename = os.path.basename(netcdf_path)
    match = re.search(r"_(\d{10})\.nc$", basename)
    if match is None:
        raise ValueError(f"Unable to extract forecast date from NetCDF path: {netcdf_path}")
    return datetime.strptime(match.group(1), "%Y%m%d%H")


def _lead_time_to_iso_range(base_datetime: datetime, lead_time_days: int) -> tuple[str, str]:
    target_date = base_datetime + timedelta(days=lead_time_days)
    time_interval_start = target_date.strftime("%Y-%m-%dT00:00:00Z")
    time_interval_end = target_date.strftime("%Y-%m-%dT23:59:59Z")
    return time_interval_start, time_interval_end


def extract_glofas_station_discharge(
    stations: dict[str, LocationPoint],
    netcdf_paths: list[str],
    country_bounds: BoundingBox,
    lead_time_max: int = LEAD_TIME_MAX,
) -> StationDischarges:
    """
    Slice global GloFAS NetCDF files to country bounds, then sample at station coordinates.

    Each NetCDF file represents one ensemble member. Each band within the file
    represents a lead time (band index = lead_time + 1).

    Returns a dict: station_code -> list of lead-time discharge objects.
    Each lead-time object contains the time interval and one discharge per ensemble.
    """
    discharges: StationDischarges = {}

    forecast_base_datetime: datetime | None = None

    for netcdf_path in netcdf_paths:
        if not os.path.exists(netcdf_path):
            logging.warning(f"NetCDF file not found, skipping: {netcdf_path}")
            continue

        if forecast_base_datetime is None:
            forecast_base_datetime = _extract_forecast_base_datetime(netcdf_path)
            for station_code in stations:
                discharges[station_code] = []
                for lead_time in range(lead_time_max):
                    time_interval_start, time_interval_end = _lead_time_to_iso_range(
                        forecast_base_datetime,
                        lead_time,
                    )
                    discharges[station_code].append(
                        LeadTimeDischarge(
                            time_interval_start=time_interval_start,
                            time_interval_end=time_interval_end,
                            ensemble_discharges=[],
                        )
                    )

        sliced_path = slice_netcdf_to_bounds(netcdf_path, country_bounds)

        logging.info(f"Extracting station discharge from {sliced_path}")
        with rasterio.open(sliced_path) as src:
            for station_code, station in stations.items():
                coords = [(float(station.lon), float(station.lat))]
                for lead_time in range(lead_time_max):
                    sampled = list(src.sample(coords, indexes=lead_time + 1))
                    value = float(sampled[0][0])*5 # Multifly *1.5 for mock alert
                    if np.isnan(value):
                        value = 0.0
                    discharges[station_code][lead_time].ensemble_discharges.append(value)

    return discharges

