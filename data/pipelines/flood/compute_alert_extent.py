from __future__ import annotations

import os


def compute_alert_extent(
    time_interval_severities: list,
    flood_extent_paths: list[str],
) -> str:
    """
    Compute the flood extent raster for the alert station by resolving the appropriate return period raster.
    Returns the path to the computed flood extent raster for the station.
    """

    return_period = _resolve_requested_return_period_value(time_interval_severities)

    flood_extent_path = _resolve_flood_extent(
        return_period=return_period,
        flood_extent_paths=flood_extent_paths,
    )
    return flood_extent_path


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


def _resolve_empty_flood_extent_path(flood_extent_paths: list[str]) -> str | None:
    for flood_extent_path in flood_extent_paths:
        filename = os.path.basename(flood_extent_path).lower()

        if filename.endswith("_empty.tif"):
            return flood_extent_path

        filename_stem, _ = os.path.splitext(filename)
        rp_index = filename_stem.rfind("_rp")
        if rp_index == -1:
            continue

        base_without_suffix = filename_stem[:rp_index]
        directory = os.path.dirname(flood_extent_path)
        empty_tif_path = os.path.join(directory, f"{base_without_suffix}_empty.tif")
        if os.path.exists(empty_tif_path):
            return empty_tif_path

    return None


def _resolve_requested_return_period_value(
    time_interval_severities: list,
) -> int | None:
    """
    Resolve flood extent raster for the highest matched return period
    """
    highest_return_period = max(
        time_interval_severities,
        key=lambda s: s.median_return_period,
    ).median_return_period

    return int(highest_return_period) if highest_return_period > 0 else None


def _resolve_flood_extent(
    return_period: int | None,
    flood_extent_paths: list[str],
) -> str:
    """
    Resolve the flood extent raster using this order:
    1. Exact return period raster.
    2. Closest lower-or-equal available return period raster.
    3. flood_map_{country}_empty.tif fallback raster (guaranteed to exist).
    """

    available_paths_by_value: dict[int, str] = {}
    for flood_extent_path in flood_extent_paths:
        if not os.path.exists(flood_extent_path):
            continue
        value = _extract_return_period_value(flood_extent_path)
        if value is not None:
            available_paths_by_value[value] = flood_extent_path

    if return_period is not None and return_period in available_paths_by_value:
        return available_paths_by_value[return_period]

    if return_period is not None:
        fallback_value = max(
            (
                value
                for value in available_paths_by_value.keys()
                if value <= return_period
            ),
            default=None,
        )
        if fallback_value is not None:
            return available_paths_by_value[fallback_value]

    # Return empty flood extent
    empty_path = _resolve_empty_flood_extent_path(flood_extent_paths)
    if empty_path is None:
        raise FileNotFoundError(
            "Could not resolve flood extent raster: no suitable return period raster "
            "or no empty fallback raster was found among existing files."
        )

    return empty_path
