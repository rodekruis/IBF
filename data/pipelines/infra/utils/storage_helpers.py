"""
Helper files for working with directories for both blob storage and local file systems
"""

import os
import shutil

# Raw data directly from GloFAS
GLOFAS_RAW_DATA_DIR = "glofas/raw"

# Country-sliced GloFAS data
GLOFAS_COUNTRY_SPLIT_DATA_DIR = "glofas/country_split"

# Country-sliced GloFAS data that has triggered an alert
GLOFAS_COUNTRY_SPLIT_ALERT_DATA_DIR = "glofas/country_split_alert"

# Country-sliced mock GloFAS data
GLOFAS_MOCK_DATA_DIR = "glofas/country_mock_data"

GLOFAS_FILE_SUFFIX = ".nc"


def get_glofas_country_split_path(country: str, netcdf_path: str) -> str:
    """
    Get resolved output path for a country-split (sliced) GloFAS NetCDF file.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        raise ValueError("DATA_CACHE_DIR environment variable is required.")
    # Split the text to remove the file extension from the string
    basename = os.path.splitext(os.path.basename(netcdf_path))[0]
    # Use a dir name for this data that matches the date stamp folder used for the source data
    date_stamp = os.path.basename(os.path.dirname(netcdf_path))
    output_dir = os.path.join(cache_base, GLOFAS_COUNTRY_SPLIT_DATA_DIR, date_stamp)
    os.makedirs(output_dir, exist_ok=True)
    return os.path.join(output_dir, f"{basename}_sliced_{country}{GLOFAS_FILE_SUFFIX}")


def get_glofas_country_split_alert_path(netcdf_path: str) -> str:
    """
    Get resolved output path for storing alert-triggering country-split GloFAS data.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        raise ValueError("DATA_CACHE_DIR environment variable is required.")
    # Use a dir name for this data that matches the date stamp folder used for the source data
    date_stamp = os.path.basename(os.path.dirname(netcdf_path))
    output_dir = os.path.join(
        cache_base, GLOFAS_COUNTRY_SPLIT_ALERT_DATA_DIR, date_stamp
    )
    os.makedirs(output_dir, exist_ok=True)
    return os.path.join(output_dir, os.path.basename(netcdf_path))


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


def get_glofas_mock_data_dir(country: str) -> str:
    """
    Get resolved path to the GLOFAS_MOCK_DATA_DIR for a country.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        raise ValueError("DATA_CACHE_DIR environment variable is required.")
    output_dir = os.path.join(cache_base, GLOFAS_MOCK_DATA_DIR, country)
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


def get_cached_glofas_files(forecast_date: str) -> list[str] | None:
    """
    Return cached GloFAS NetCDF files for the given forecast_date if they exist.
    Returns None otherwise.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        return None
    cache_dir = os.path.join(cache_base, GLOFAS_RAW_DATA_DIR, forecast_date)
    if not os.path.isdir(cache_dir):
        return None

    files = []
    for name in sorted(os.listdir(cache_dir)):
        # Only grab files of the correct type
        if not name.endswith(GLOFAS_FILE_SUFFIX):
            continue
        file_path = os.path.join(cache_dir, name)
        # Remove empty files (incomplete or failed downloads)
        if os.path.getsize(file_path) == 0:
            os.remove(file_path)
            continue
        files.append(file_path)

    if not files:
        return None

    return files


def find_latest_forecast_date_in_cache(subdir: str) -> str | None:
    """
    Find the most recent forecast_date folder inside DATA_CACHE_DIR/{subdir}.
    Returns the date string (YYYYMMDD) or None if no dated folders exist.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        return None
    parent_dir = os.path.join(cache_base, subdir)
    if not os.path.isdir(parent_dir):
        return None

    date_dirs = [
        name
        for name in sorted(os.listdir(parent_dir), reverse=True)
        if os.path.isdir(os.path.join(parent_dir, name))
        and name.isdigit()
        and len(name) == 8
    ]
    if not date_dirs:
        return None
    return date_dirs[0]


def get_cached_glofas_country_split_files(
    country: str, forecast_date: str
) -> list[str] | None:
    """
    Return cached country-split GloFAS NetCDF files for the given country and
    forecast_date. Returns None if none exist.
    """
    cache_base = os.environ.get("DATA_CACHE_DIR")
    if not cache_base:
        return None
    cache_dir = os.path.join(cache_base, GLOFAS_COUNTRY_SPLIT_DATA_DIR, forecast_date)
    if not os.path.isdir(cache_dir):
        return None

    suffix = f"_sliced_{country}{GLOFAS_FILE_SUFFIX}"
    files = [
        os.path.join(cache_dir, name)
        for name in sorted(os.listdir(cache_dir))
        if name.endswith(suffix) and os.path.getsize(os.path.join(cache_dir, name)) > 0
    ]

    if not files:
        return None

    return files


def archive_alert_glofas_files(country_sliced_netcdf_paths: list[str]) -> None:
    """
    Archive country-sliced GloFAS NetCDF files to alert storage with longer retention.
    """

    for country_sliced_path in country_sliced_netcdf_paths:
        alert_path = get_glofas_country_split_alert_path(country_sliced_path)
        shutil.copy2(country_sliced_path, alert_path)
