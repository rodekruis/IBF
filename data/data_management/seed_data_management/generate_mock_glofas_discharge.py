"""Generate small country-clipped mock GloFAS discharge NetCDF files.

Creates synthetic NetCDF files for testing the floods pipeline end-to-end.
Two variants are generated per country:
  - no-alert: all discharge values below the lowest station threshold
  - alert: discharge values above threshold at one station

Output files are named: {COUNTRY}_glofas_discharge_{variant}.nc
They should be committed to the IBF-seed-data repo under pipelines/glofas-discharge/

Usage:
    cd data
    uv run python data_management/seed_data_management/generate_mock_glofas_discharge.py --country ETH

Requirements:
    - GITHUB_DATA_BASE_URL env var set (to fetch station thresholds)
    - Or provide station thresholds via --thresholds-file
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import numpy as np
import xarray as xr
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from shared.download_helpers import download_json_source

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

GLOFAS_RESOLUTION = 0.05
NODATA_VALUE = -9999.0
NUM_LEAD_TIMES = 8
COUNTRY_BUFFER_DEGREES = 0.5


def fetch_station_thresholds(country: str) -> list[dict]:
    base_url = os.environ.get("GITHUB_DATA_BASE_URL")
    if not base_url:
        raise ValueError("GITHUB_DATA_BASE_URL environment variable is required")

    url = f"{base_url}/pipelines/{country}_station_thresholds.json"
    logger.info(f"Fetching station thresholds from {url}")
    data = download_json_source(url, check_count=False)
    if data is None:
        raise FileNotFoundError(f"Failed to download station thresholds from {url}")

    seen: set[str] = set()
    unique: list[dict] = []
    for entry in data:
        if entry["station_code"] not in seen:
            seen.add(entry["station_code"])
            unique.append(entry)
    return unique


def compute_country_grid(
    stations: list[dict],
) -> tuple[np.ndarray, np.ndarray, float, float]:
    lats = [s["lat"] for s in stations]
    lons = [s["lon"] for s in stations]

    min_lat = min(lats) - COUNTRY_BUFFER_DEGREES
    max_lat = max(lats) + COUNTRY_BUFFER_DEGREES
    min_lon = min(lons) - COUNTRY_BUFFER_DEGREES
    max_lon = max(lons) + COUNTRY_BUFFER_DEGREES

    min_lat = round(min_lat / GLOFAS_RESOLUTION) * GLOFAS_RESOLUTION
    max_lat = round(max_lat / GLOFAS_RESOLUTION) * GLOFAS_RESOLUTION
    min_lon = round(min_lon / GLOFAS_RESOLUTION) * GLOFAS_RESOLUTION
    max_lon = round(max_lon / GLOFAS_RESOLUTION) * GLOFAS_RESOLUTION

    lat_coords = np.arange(max_lat, min_lat - GLOFAS_RESOLUTION / 2, -GLOFAS_RESOLUTION)
    lon_coords = np.arange(min_lon, max_lon + GLOFAS_RESOLUTION / 2, GLOFAS_RESOLUTION)

    return lat_coords, lon_coords, min_lat, min_lon


def find_nearest_indices(
    lat_coords: np.ndarray, lon_coords: np.ndarray, lat: float, lon: float
) -> tuple[int, int]:
    lat_idx = int(np.argmin(np.abs(lat_coords - lat)))
    lon_idx = int(np.argmin(np.abs(lon_coords - lon)))
    return lat_idx, lon_idx


def generate_no_alert_file(
    country: str,
    stations: list[dict],
    output_dir: Path,
) -> Path:
    lat_coords, lon_coords, _, _ = compute_country_grid(stations)
    height = len(lat_coords)
    width = len(lon_coords)

    discharge = np.full((NUM_LEAD_TIMES, height, width), NODATA_VALUE, dtype=np.float32)

    for station in stations:
        lat_idx, lon_idx = find_nearest_indices(
            lat_coords, lon_coords, station["lat"], station["lon"]
        )
        rp_1_5_threshold = station["thresholds"][0]["threshold_value"]
        safe_value = rp_1_5_threshold * 0.5
        for lead_time in range(NUM_LEAD_TIMES):
            discharge[lead_time, lat_idx, lon_idx] = safe_value

    ds = xr.Dataset(
        {"dis": (["time", "lat", "lon"], discharge)},
        coords={
            "time": np.arange(NUM_LEAD_TIMES),
            "lat": lat_coords,
            "lon": lon_coords,
        },
    )

    output_path = output_dir / f"{country}_glofas_discharge_no-alert.nc"
    ds.to_netcdf(output_path)
    logger.info(
        f"Generated no-alert file: {output_path} ({output_path.stat().st_size / 1024:.0f} KB)"
    )
    return output_path


def generate_alert_file(
    country: str,
    stations: list[dict],
    output_dir: Path,
) -> Path:
    lat_coords, lon_coords, _, _ = compute_country_grid(stations)
    height = len(lat_coords)
    width = len(lon_coords)

    discharge = np.full((NUM_LEAD_TIMES, height, width), NODATA_VALUE, dtype=np.float32)

    sorted_stations = sorted(
        stations, key=lambda s: s["thresholds"][0]["threshold_value"]
    )
    alert_station = sorted_stations[0]

    for station in stations:
        lat_idx, lon_idx = find_nearest_indices(
            lat_coords, lon_coords, station["lat"], station["lon"]
        )
        rp_1_5_threshold = station["thresholds"][0]["threshold_value"]

        if station["station_code"] == alert_station["station_code"]:
            rp_5_threshold = station["thresholds"][2]["threshold_value"]
            alert_value = rp_5_threshold * 1.5
            for lead_time in range(NUM_LEAD_TIMES):
                discharge[lead_time, lat_idx, lon_idx] = alert_value
        else:
            safe_value = rp_1_5_threshold * 0.5
            for lead_time in range(NUM_LEAD_TIMES):
                discharge[lead_time, lat_idx, lon_idx] = safe_value

    ds = xr.Dataset(
        {"dis": (["time", "lat", "lon"], discharge)},
        coords={
            "time": np.arange(NUM_LEAD_TIMES),
            "lat": lat_coords,
            "lon": lon_coords,
        },
    )

    output_path = output_dir / f"{country}_glofas_discharge_alert.nc"
    ds.to_netcdf(output_path)
    logger.info(
        f"Generated alert file: {output_path} ({output_path.stat().st_size / 1024:.0f} KB)"
    )
    logger.info(
        f"  Alert station: {alert_station['station_code']} "
        f"at ({alert_station['lat']}, {alert_station['lon']}), "
        f"RP5 threshold={alert_station['thresholds'][2]['threshold_value']:.2f}"
    )
    return output_path


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Generate mock GloFAS discharge NetCDF files for the seed-data repo."
    )
    parser.add_argument(
        "--country",
        required=True,
        help="ISO 3-letter country code (e.g. ETH, KEN)",
    )
    parser.add_argument(
        "--thresholds-file",
        help="Path to local station thresholds JSON (skips seed-repo download)",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory to write output files (default: current directory)",
    )
    args = parser.parse_args()

    country = args.country.upper()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.thresholds_file:
        with open(args.thresholds_file) as f:
            raw_data = json.load(f)
        seen: set[str] = set()
        stations: list[dict] = []
        for entry in raw_data:
            if entry["station_code"] not in seen:
                seen.add(entry["station_code"])
                stations.append(entry)
    else:
        stations = fetch_station_thresholds(country)

    logger.info(
        f"Generating mock GloFAS files for {country} ({len(stations)} stations)"
    )

    generate_no_alert_file(country, stations, output_dir)
    generate_alert_file(country, stations, output_dir)

    logger.info("Done.")


if __name__ == "__main__":
    main()
