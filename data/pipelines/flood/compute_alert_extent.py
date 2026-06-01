from __future__ import annotations

import logging

import numpy as np

from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.loaded_data_types import RasterData

# Supported return period labels used by flood alerts.

RETURN_PERIODS: dict[str, int] = {
    "5yr": 5,
    "10yr": 10,
    "20yr": 20,
    "25yr": 25,
    "50yr": 50,
    "100yr": 100,
}


def compute_alert_extent(
    time_interval_severities: list,
    flood_extent_provider: FloodExtentProvider,
) -> RasterData:
    """
    Compute the flood extent raster for the alert station by resolving the appropriate return period raster.
    Returns the flood extent as in-memory raster data.
    """

    return_period = _resolve_requested_return_period_value(time_interval_severities)

    flood_extent = _resolve_flood_extent(
        return_period=return_period,
        flood_extent_provider=flood_extent_provider,
    )
    return flood_extent


def _extract_return_period_label_value(return_period_label: str) -> int | None:
    normalized_label = return_period_label.strip().lower()

    if normalized_label.endswith("yr"):
        value_text = normalized_label[:-2].strip()
        if value_text.isdigit():
            return int(value_text)

    return None


def _resolve_requested_return_period_value(
    time_interval_severities: list,
) -> int | None:
    highest_return_period = max(
        time_interval_severities,
        key=lambda s: s.median_discharge,
    ).return_period

    return_period = RETURN_PERIODS.get(highest_return_period)
    if return_period is not None:
        return return_period

    parsed_return_period = _extract_return_period_label_value(highest_return_period)
    if parsed_return_period is None:
        logging.warning(
            f"Unknown return period '{highest_return_period}', using empty fallback"
        )

    return parsed_return_period


def _resolve_flood_extent(
    return_period: int | None,
    flood_extent_provider: FloodExtentProvider,
) -> RasterData:
    """
    Resolve the flood extent raster using this order:
    1. Exact return period raster.
    2. Closest lower-or-equal available return period raster.
    3. Empty fallback raster.
    """
    available = flood_extent_provider.available_return_periods

    if return_period is not None and return_period in available:
        return flood_extent_provider.get_raster(return_period)

    if return_period is not None:
        fallback_value = max(
            (rp for rp in available if rp <= return_period),
            default=None,
        )
        if fallback_value is not None:
            return flood_extent_provider.get_raster(fallback_value)

    return _create_empty_raster(flood_extent_provider)


def _create_empty_raster(flood_extent_provider: FloodExtentProvider) -> RasterData:
    if not flood_extent_provider.available_return_periods:
        raise FileNotFoundError(
            "Could not resolve flood extent raster: no available return period "
            "rasters to derive an empty fallback from."
        )

    reference_return_period = flood_extent_provider.available_return_periods[0]
    reference_raster = flood_extent_provider.get_raster(reference_return_period)

    empty_array = np.zeros_like(reference_raster.array)

    return RasterData(
        array=empty_array,
        transform=reference_raster.transform,
        crs=reference_raster.crs,
        nodata=reference_raster.nodata,
    )
