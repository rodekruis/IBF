from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

import rasterio

from pipelines.infra.data_types.location_point import LocationPoint


@dataclass
class TimeIntervalDischarge:
    time_interval_start: str
    time_interval_end: str
    ensemble_discharges: list[float]


StationDischarges = dict[str, list[TimeIntervalDischarge]]


def extract_discharge_glofas_station(
    station_code: str,
    station: LocationPoint,
    netcdf_paths: list[str],
    temporal_extent: dict[str, list],
) -> StationDischarges:
    """
    Sample discharge from pre-sliced GloFAS NetCDF files at station coordinates.

    Each NetCDF file represents one ensemble member. Each band within the file
    represents a lead time (band index = lead_time + 1).

    Returns a dict containing one entry: station_code -> list of lead-time discharge
    objects. Each lead-time object contains the time interval and one discharge per
    ensemble.
    """
    lead_time_min, lead_time_max = _parse_lead_time_range(temporal_extent)
    discharges: StationDischarges = {station_code: []}

    forecast_base_datetime: datetime | None = None

    for netcdf_path in netcdf_paths:
        # TODO: to catch exact today date netcdf file
        if not os.path.exists(netcdf_path):
            logging.warning(f"NetCDF file not found, skipping: {netcdf_path}")
            continue

        if forecast_base_datetime is None:
            forecast_base_datetime = _extract_forecast_base_datetime(netcdf_path)
            for lead_time in range(lead_time_min, lead_time_max + 1):
                time_interval_start, time_interval_end = _lead_time_to_time_interval(
                    forecast_base_datetime,
                    lead_time,
                )
                discharges[station_code].append(
                    TimeIntervalDischarge(
                        time_interval_start=time_interval_start,
                        time_interval_end=time_interval_end,
                        ensemble_discharges=[],
                    )
                )

        logging.info(f"Extracting station discharge from {netcdf_path}")
        with rasterio.open(netcdf_path) as src:
            station_coords = [(float(station.lon), float(station.lat))]
            for lead_time in range(lead_time_min, lead_time_max + 1):
                discharge_sampled = list(
                    src.sample(station_coords, indexes=lead_time + 1)
                )
                discharge_value = float(discharge_sampled[0][0])
                discharges[station_code][lead_time].ensemble_discharges.append(
                    discharge_value
                )

    return discharges


def _parse_lead_time_range(temporal_extent: dict[str, list]) -> tuple[int, int]:
    """Parse a flood temporal extent into (lead_time_min, lead_time_max).

    Expects {"lead-time-spectrum": ["0-day", "1-day", ..., "7-day"]}.
    Returns (0, 7) for that example.
    """
    spectrum = temporal_extent.get("lead-time-spectrum")
    if not spectrum:
        raise ValueError(
            f"Temporal extent missing 'lead-time-spectrum': {temporal_extent}"
        )
    days = [int(entry.split("-")[0]) for entry in spectrum]
    return (min(days), max(days))


def _extract_forecast_base_datetime(netcdf_path: str) -> datetime:
    """Extract forecast run datetime from a file name like dis_00_2026040800_sliced.nc."""  # TODO: extract date 0 from nc dims instead
    basename = os.path.basename(netcdf_path)
    match = re.search(r"_(\d{10})_sliced\.nc$", basename)
    if match is None:
        raise ValueError(
            f"Unable to extract forecast date from NetCDF path: {netcdf_path}"
        )
    return datetime.strptime(match.group(1), "%Y%m%d%H")


def _lead_time_to_time_interval(
    base_datetime: datetime, lead_time_days: int
) -> tuple[str, str]:
    target_date = base_datetime + timedelta(days=lead_time_days)
    time_interval_start = target_date.strftime("%Y-%m-%dT00:00:00Z")
    time_interval_end = target_date.strftime("%Y-%m-%dT23:59:59Z")
    return time_interval_start, time_interval_end
