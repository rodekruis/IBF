from __future__ import annotations

import logging
import os

# Mapping from return period labels to flood extent raster filenames.
# Expected directory structure: {flood_extent_directory}/{filename}
# These files are pre-computed flood extent rasters per return period.
RETURN_PERIOD_RASTER_MAP: dict[str, str] = {
    "5yr": "flood_extent_rp5.tif",
    "10yr": "flood_extent_rp10.tif",
    "25yr": "flood_extent_rp25.tif",
    "50yr": "flood_extent_rp50.tif",
    "100yr": "flood_extent_rp100.tif",
}

# Ordered from highest to lowest for fallback matching
_RETURN_PERIOD_ORDER = ["100yr", "50yr", "25yr", "10yr", "5yr"]


def resolve_flood_extent_raster(
    matched_return_period: str,
    flood_extent_directory: str,
) -> str | None:
    """
    Find the flood extent raster file for the matched return period.
    If the exact return period file is not available, falls back to the
    closest lower return period that has a file on disk.
    """
    # Try exact match first
    exact_filename = RETURN_PERIOD_RASTER_MAP.get(matched_return_period)
    if exact_filename:
        exact_path = os.path.join(flood_extent_directory, exact_filename)
        if os.path.exists(exact_path):
            return exact_path

    # Fallback: find closest available RP at or below the matched one
    try:
        matched_index = _RETURN_PERIOD_ORDER.index(matched_return_period)
    except ValueError:
        logging.warning(
            f"Unknown return period '{matched_return_period}', cannot resolve flood extent"
        )
        return None

    for rp in _RETURN_PERIOD_ORDER[matched_index:]:
        filename = RETURN_PERIOD_RASTER_MAP.get(rp)
        if filename:
            path = os.path.join(flood_extent_directory, filename)
            if os.path.exists(path):
                logging.info(
                    f"Exact RP '{matched_return_period}' not available, "
                    f"falling back to '{rp}'"
                )
                return path

    logging.warning(
        f"No flood extent raster found for return period '{matched_return_period}' "
        f"or any fallback in {flood_extent_directory}"
    )
    return None
