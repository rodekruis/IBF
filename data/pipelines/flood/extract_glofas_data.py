from __future__ import annotations

import logging
import os

import numpy as np
import rasterio

from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.raster_utils import BoundingBox, slice_netcdf_to_bounds

# { station_code: { lead_time: [discharge_per_ensemble] } }
StationDischarges = dict[str, dict[int, list[float]]]

LEAD_TIME_MAX = 8


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

    Returns a nested dict: station_code -> lead_time -> list of discharge values
    (one per ensemble member).
    """
    discharges: StationDischarges = {}

    for station_code in stations:
        discharges[station_code] = {lt: [] for lt in range(lead_time_max)}

    for netcdf_path in netcdf_paths:
        if not os.path.exists(netcdf_path):
            logging.warning(f"NetCDF file not found, skipping: {netcdf_path}")
            continue

        sliced_path = slice_netcdf_to_bounds(netcdf_path, country_bounds)

        logging.info(f"Extracting station discharge from {sliced_path}")
        with rasterio.open(sliced_path) as src:
            for station_code, station in stations.items():
                coords = [(float(station.lon), float(station.lat))]
                for lead_time in range(lead_time_max):
                    sampled = list(src.sample(coords, indexes=lead_time + 1))
                    value = float(sampled[0][0])
                    if np.isnan(value):
                        value = 0.0
                    discharges[station_code][lead_time].append(value)

    return discharges

