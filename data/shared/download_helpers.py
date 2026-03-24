"""
Helper functions for downloading
"""

import json
from urllib.error import URLError
from urllib.request import urlopen

import requests


def get_worldpop_url(country_iso_a3):

    # URL for the population data
    # If a new model comes out, update this.
    # See the WorldPop website for more information:
    # https://hub.worldpop.org/project/list
    # https://data.worldpop.org/GIS/Population/Global_2015_2030/
    WORLDPOP_RELEASE = "R2025A"
    WORLDPOP_YEAR = "2026"
    WORLDPOP_VERSION = "v1"
    WORLDPOP_RESOLUTION = "100m"
    BASE_URL = (
        "https://data.worldpop.org/GIS/Population/Global_2015_2030/"
        f"{WORLDPOP_RELEASE}/{WORLDPOP_YEAR}/"
    )

    country_upper = country_iso_a3.upper()
    country_lower = country_iso_a3.lower()
    return (
        f"{BASE_URL}{country_upper}/{WORLDPOP_VERSION}/{WORLDPOP_RESOLUTION}/constrained/"
        f"{country_lower}_pop_{WORLDPOP_YEAR}_CN_{WORLDPOP_RESOLUTION}_{WORLDPOP_RELEASE}_{WORLDPOP_VERSION}.tif"
    )


def get_worldpop_uri(country_code: str, year: int) -> str:
    return f"https://data.worldpop.org/GIS/Population/Global_2000_2020/{country_code}/{country_code}_ppp_{year}.tif"


def download_binary_object(url: str):
    print(f"Downloading from {url}...")
    try:
        if url.startswith("ftp://"):
            with urlopen(url, timeout=60) as response:
                return response.read()
        else:
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            return response.content
    except (requests.exceptions.RequestException, URLError) as e:
        status_code = (
            getattr(e.response, "status_code", "N/A")
            if hasattr(e, "response")
            else "N/A"
        )
        print(
            f"Error: Failed to download from '{url}'. Status: {status_code}, error: {e}"
        )
    return None


def download_json_source(name: str, url: str, check_count: bool = True):

    # Get data
    attempt = 0
    max_attempts = 3
    success = False
    response = None

    while attempt < max_attempts and not success:
        print(f"Downloading {name} from {url}, attempt {attempt + 1}...")
        try:
            response = requests.get(url, timeout=60)
            success = response.ok
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            status_code = (
                getattr(e.response, "status_code", "N/A")
                if hasattr(e, "response")
                else "N/A"
            )
            print(
                f"Error: Failed to download '{name}'. Status: {status_code}, error: {e}"
            )
            attempt += 1

    if not success or response is None:
        print(f"Error: Failed to download '{name}' after {max_attempts} attempts.")
        return None

    # Try to parse as JSON
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON for '{name}' - Error: {e}")
        return None

    # Check count vs actual items
    if check_count:
        if "count" in data and "results" in data:
            expected_count = data["count"]
            actual_count = len(data["results"])
            if actual_count != expected_count:
                print(
                    f"Error: '{name}' count mismatch. Expected: {expected_count}, Got: {actual_count}"
                )
            else:
                print(f"  -- {actual_count} out of {expected_count} items parsed.")
        else:
            print(
                f"Error: {name} returned no results or did not contain keys 'count' and 'results'."
            )

    return data
