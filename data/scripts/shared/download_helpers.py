"""
Helper functions for downloading
"""

import requests
import json
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

def download_binary_object(url : str):
    print(f"Downloading from {url}...")
    try:
        if url.startswith('ftp://'):
            with urlopen(url, timeout=60) as response:
                return response.read()
        else:
            response = requests.get(url, timeout=60)
            response.raise_for_status()
            return response.content
    except (requests.exceptions.RequestException, URLError) as e:
        status_code = getattr(e.response, 'status_code', 'N/A') if hasattr(e, 'response') else 'N/A'
        print(f"Error: Failed to download from '{url}'. Status: {status_code}, error: {e}")
    return None

def download_json_source(name : str, url : str):
    print(f"Downloading {name} from {url}...")

    # Get data
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        status_code = getattr(e.response, 'status_code', 'N/A') if hasattr(e, 'response') else 'N/A'
        print(f"Error: Failed to download '{name}'. Status: {status_code}, error: {e}")
        return

    # Try to parse as JSON
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON for '{name}' - Error: {e}")
        return

    # Check count vs actual items
    if "count" in data and "results" in data:
        expected_count = data["count"]
        actual_count = len(data["results"])
        if actual_count != expected_count:
            print(f"Error: '{name}' count mismatch. Expected: {expected_count}, Got: {actual_count}")
        else:
            print(f"  -- {actual_count} out of {expected_count} items parsed.")
    else:
        print(f"Error: {name} returned no results.")
    
    return data

    