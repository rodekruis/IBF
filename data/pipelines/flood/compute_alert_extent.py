from __future__ import annotations

import logging
import os

# Supported return period labels used by flood alerts.

RETURN_PERIODS: dict[str, int] = {
    "5yr": 5,
    "10yr": 10,
    "20yr": 20,
    "25yr": 25,
    "50yr": 50,
    "100yr": 100
}


def _extract_return_period_value(path: str) -> int | None:
    """
    Extract the return period value from a flood extent raster file name.
    Expected file name format: flood_map_{country}_rp{value}.tif, e.g. flood_map_ETH_rp20.tif -> 20
    Returns the return period value as an integer, or None if it cannot be extracted e.g. flood_map_ETH_empty.tif.
    """
    filename = os.path.basename(path).lower()

    filename_stem, _ = os.path.splitext(filename)
    rp_index = filename_stem.rfind("_rp")
    if rp_index == -1:
        return None

    value_text = filename_stem[rp_index + len("_rp") :]
    if value_text.isdigit():
        return int(value_text)

    return None

def _extract_return_period_label_value(return_period_label: str) -> int | None:
    """
    Extract the return period value from a return period label.
    Expected label format: "Xyr", e.g. "5yr", "20yr".
    Returns the return period value as an integer, or None if it cannot be extracted.
    """
    normalized_label = return_period_label.strip().lower()

    if normalized_label.endswith("yr"):
        value_text = normalized_label[:-2].strip()
        if value_text.isdigit():
            return int(value_text)

    return None


def _resolve_empty_flood_extent_path(flood_extent_paths: list[str]) -> str | None:
    for path in flood_extent_paths:
        filename = os.path.basename(path).lower()

        filename_stem, _ = os.path.splitext(filename)
        rp_index = filename_stem.rfind("_rp")
        if rp_index == -1:
            continue

        base_without_suffix = filename_stem[:rp_index]
        directory = os.path.dirname(path)
        empty_tif_path = os.path.join(directory, f"{base_without_suffix}_empty.tif")
        if os.path.exists(empty_tif_path):
            return empty_tif_path

    return None

def _resolve_requested_return_period_value(flood_return_period: str) -> int | None:
    matched_value = RETURN_PERIODS.get(flood_return_period)
    if matched_value is not None:
        return matched_value

    parsed_return_period = _extract_return_period_label_value(flood_return_period)
    if parsed_return_period is None:
        logging.warning(
            f"Unknown return period '{flood_return_period}', using empty fallback"
        )

    return parsed_return_period

def resolve_flood_extent_raster(
    flood_return_period: str,
    flood_extent_paths: list[str],
) -> str:
    """
    Resolve the flood extent raster using this order:
    1. Exact return period raster.
    2. Closest lower-or-equal available return period raster.
    3. flood_map_{country}_empty.tif fallback raster (guaranteed to exist).
    """
    matched_value = _resolve_requested_return_period_value(flood_return_period)

    available_paths_by_value: dict[int, str] = {}
    for path in flood_extent_paths:
        value = _extract_return_period_value(path)
        if value is not None:
            available_paths_by_value[value] = path

    if matched_value is not None and matched_value in available_paths_by_value:
        return available_paths_by_value[matched_value]

    if matched_value is not None:
        fallback_value = max(
            (value for value in available_paths_by_value.keys() if value <= matched_value),
            default=None,
        )
        if fallback_value is not None:
            return available_paths_by_value[fallback_value]

    # Return empty flood extent
    empty_path = _resolve_empty_flood_extent_path(flood_extent_paths)
    assert empty_path is not None, "Empty flood extent fallback raster must exist"
    return empty_path

