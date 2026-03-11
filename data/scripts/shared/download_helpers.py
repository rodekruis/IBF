"""
Helper functions for downloading
"""

import requests
import json
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

def download_json_source(name : str, url : str, check_count : bool = True):

    # Get data
    attempt = 0
    max_attempts = 3
    success = False

    while attempt < max_attempts and not success:
        print(f"Downloading {name} from {url}, attempt {attempt + 1}...")
        try:
            response = requests.get(url, timeout=60)
            success = response.ok
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            status_code = getattr(e.response, 'status_code', 'N/A') if hasattr(e, 'response') else 'N/A'
            print(f"Error: Failed to download '{name}'. Status: {status_code}, error: {e}")
            attempt += 1

    # Try to parse as JSON
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON for '{name}' - Error: {e}")
        return

    # Check count vs actual items
    if check_count:
        if "count" in data and "results" in data:
            expected_count = data["count"]
            actual_count = len(data["results"])
            if actual_count != expected_count:
                print(f"Error: '{name}' count mismatch. Expected: {expected_count}, Got: {actual_count}")
            else:
                print(f"  -- {actual_count} out of {expected_count} items parsed.")
        else:
            print(f"Error: {name} returned no results or did not contain keys 'count' and 'results'.")
    
    return data

    