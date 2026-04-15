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
    filename = os.path.basename(path).lower()
    if not filename.startswith("flood_map_") or not filename.endswith(".tif"):
        return None

    filename_stem, _ = os.path.splitext(filename)
    rp_index = filename_stem.rfind("_rp")
    if rp_index == -1:
        return None

    value_text = filename_stem[rp_index + len("_rp") :]
    if value_text.isdigit():
        return int(value_text)

    return None


def _extract_return_period_label_value(return_period_label: str) -> int | None:
    normalized_label = return_period_label.strip().lower()

    if normalized_label.isdigit():
        return int(normalized_label)

    for suffix in ("yr", "year"):
        if normalized_label.endswith(suffix):
            value_text = normalized_label[: -len(suffix)].strip()
            if value_text.isdigit():
                return int(value_text)

    return None


def _resolve_empty_flood_extent_path(flood_extent_paths: list[str]) -> str | None:
    for path in flood_extent_paths:
        filename = os.path.basename(path).lower()
        if not filename.startswith("flood_map_") or not filename.endswith(".tif"):
            continue

        filename_stem, _ = os.path.splitext(filename)
        if "_" not in filename_stem:
            continue

        base_without_suffix = filename_stem.rsplit("_", 1)[0]
        if not base_without_suffix.startswith("flood_map_"):
            continue

        directory = os.path.dirname(path)
        empty_tif_path = os.path.join(directory, f"{base_without_suffix}_empty.tif")
        if os.path.exists(empty_tif_path):
            return empty_tif_path

    return None


def resolve_flood_extent_raster(
    flood_return_period: str,
    flood_extent_paths: list[str],
) -> str:
    """
    Find the flood extent raster file for the matched return period.
    If the exact return period file is not available, falls back to the
    closest lower return period that has a file on disk. If none exists,
    falls back to flood_map_{country}_empty.tif.
    """
    matched_value = RETURN_PERIODS.get(flood_return_period)
    if matched_value is None:
        parsed_return_period = _extract_return_period_label_value(flood_return_period)
        if parsed_return_period is None:
            logging.warning(
                f"Unknown return period '{flood_return_period}', using empty fallback"
            )
        matched_value = parsed_return_period

    empty_flood_extent_path = _resolve_empty_flood_extent_path(flood_extent_paths)

    available_paths_by_value: dict[int, str] = {}
    for path in flood_extent_paths:
        if not os.path.exists(path):
            continue

        value = _extract_return_period_value(path)
        if value is not None:
            available_paths_by_value[value] = path

    if matched_value is not None and matched_value in available_paths_by_value:
        return available_paths_by_value[matched_value]

    lower_or_equal_values = []
    if matched_value is not None:
        lower_or_equal_values = [
            value for value in available_paths_by_value.keys() if value <= matched_value
        ]
    if lower_or_equal_values:
        fallback_value = max(lower_or_equal_values)
        return available_paths_by_value[fallback_value]

    if empty_flood_extent_path:
        return empty_flood_extent_path

    error_message = (
        f"No flood extent raster found for '{flood_return_period}' "
        "and no empty fallback raster was found"
    )
    logging.error(error_message)
    raise FileNotFoundError(error_message)

