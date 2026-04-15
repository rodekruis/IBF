from __future__ import annotations

import logging
import os

# Mapping from return period labels to flood extent raster filenames.
# Expected directory structure: {flood_extent_directory}/{filename}
# These files are pre-computed flood extent rasters per return period.

RETURN_PERIODS: dict[str, int] = {
    "5yr":   5,
    "10yr":  10,
    "25yr":  25,
    "50yr":  50,
    "100yr": 100
}
RETURN_PERIOD_RASTER_MAP = {rp: f"flood_extent_{rp}.tif" for rp in RETURN_PERIODS.keys()}

def resolve_flood_extent_raster(
    flood_return_period: str,
    flood_extent_directory: str,
) -> str | None:
    """
    Find the flood extent raster file for the matched return period.
    If the exact return period file is not available, falls back to the
    closest lower return period that has a file on disk.
    """
    # Try exact match first
    exact_filename = RETURN_PERIOD_RASTER_MAP.get(flood_return_period)
    if exact_filename:
        exact_path = os.path.join(flood_extent_directory, exact_filename)
        if os.path.exists(exact_path):
            return exact_path

    # Fallback: find closest available RP at or below the matched one
    matched_value = RETURN_PERIODS.get(flood_return_period)
    if matched_value is None:
        logging.warning(
            f"Unknown return period '{flood_return_period}', cannot resolve flood extent"
        )
        return None

    for rp, value in RETURN_PERIODS.items():
        if value >= matched_value:
            filename = RETURN_PERIOD_RASTER_MAP.get(rp)
            path = os.path.join(flood_extent_directory, filename)
            return path

    logging.warning(
        f"No flood extent raster found for return period '{flood_return_period}' "
        f"or any fallback in {flood_extent_directory}"
    )
    return None
