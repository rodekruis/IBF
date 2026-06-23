"""
Helper files for working with directories for both blob storage and local file systems
"""

import os
from datetime import datetime, timezone

# Raw data directly from GloFAS
GLOFAS_RAW_DATA_DIR = "glofas/raw"


def get_glofas_raw_data_dir(forecast_date: str) -> str:
    """
    Get resolved path to the GLOFAS_RAW_DATA_DIR
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        raise ValueError("DATA_CACHE_DIR environment variable is required.")
    output_dir = os.path.join(cache_base, GLOFAS_RAW_DATA_DIR, forecast_date)
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


def get_cached_glofas_files(forecast_date: str, max_age_hours: int) -> list[str] | None:
    """
    Return cached GloFAS NetCDF files for the given forecast_date if they exist
    and the oldest file is no older than max_age_hours. Returns None otherwise.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        return None
    cache_dir = os.path.join(cache_base, GLOFAS_RAW_DATA_DIR, forecast_date)
    if not os.path.isdir(cache_dir):
        return None
    files = sorted(
        os.path.join(cache_dir, name)
        for name in os.listdir(cache_dir)
        if name.endswith(".nc")
    )
    if not files:
        return None
    oldest_mtime = min(os.path.getmtime(f) for f in files)
    age_hours = (datetime.now(timezone.utc).timestamp() - oldest_mtime) / 3600
    if age_hours <= max_age_hours:
        return files
    return None
