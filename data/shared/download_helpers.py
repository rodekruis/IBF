"""
Helper functions for downloading
"""

import json
import logging
from urllib.error import URLError
from urllib.request import urlopen

import requests

logger = logging.getLogger(__name__)


def download_object(url: str) -> bytes | None:
    """
    Generic download function with retry logic
    """
    max_retries = 3
    attempt = 0
    while attempt < max_retries:
        attempt += 1
        logger.info(f"Downloading from '{url}' (attempt {attempt}/{max_retries})")
        try:
            if url.startswith("ftp://"):
                with urlopen(url, timeout=60) as response:
                    return response.read()
            else:
                response = requests.get(url, timeout=60)
                response.raise_for_status()
                return response.content
        except (requests.exceptions.RequestException, URLError) as exc:
            status_code = (
                getattr(exc.response, "status_code", "N/A")
                if hasattr(exc, "response")
                else "N/A"
            )
            logger.error(
                f"Attempt {attempt}/{max_retries} failed for '{url}'. "
                f"Status: {status_code}, error: {exc}"
            )

    logger.error(f"All {max_retries} attempts failed for '{url}'")
    return None


def download_json_source(url: str, check_count: bool = True):

    content = download_object(url)
    if content is None:
        return None

    # Try to parse as JSON
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from '{url}' - Error: {e}")
        return None

    # Check count vs actual items
    if check_count:
        if "count" in data and "results" in data:
            expected_count = data["count"]
            actual_count = len(data["results"])
            if actual_count != expected_count:
                print(
                    f"Error: '{url}' count mismatch. Expected: {expected_count}, Got: {actual_count}"
                )
            else:
                print(f"  -- {actual_count} out of {expected_count} items parsed.")
        else:
            print(
                f"Error: '{url}' returned no results or did not contain keys 'count' and 'results'."
            )

    return data
