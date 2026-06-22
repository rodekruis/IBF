from __future__ import annotations

import numpy as np

from pipelines.flood.determine_alerts import TimeIntervalSeverity
from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.loaded_data_types import RasterData


def compute_flood_depth(
    time_interval_severities: list[TimeIntervalSeverity],
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


def _resolve_requested_return_period_value(
    time_interval_severities: list[TimeIntervalSeverity],
) -> float | None:
    highest_return_period = max(
        time_interval_severities,
        key=lambda s: s.median_return_period,
    ).median_return_period

    if highest_return_period <= 0:
        return None

    return float(highest_return_period)


def _resolve_flood_extent(
    return_period: float | None,
    flood_extent_provider: FloodExtentProvider,
) -> RasterData:
    """
    Resolve the flood extent raster using this order:
    1. Exact return period raster.
    2. Closest lower-or-equal available return period raster.
    3. Empty fallback raster.
    """
    available = flood_extent_provider.available_return_periods

    if return_period is not None:
        exact_match = (
            int(return_period) if return_period == int(return_period) else None
        )
        if exact_match is not None and exact_match in available:
            return flood_extent_provider.get_raster(exact_match)

        fallback_value = max(
            (rp for rp in available if rp <= return_period),
            default=None,
        )
        if fallback_value is not None:
            return flood_extent_provider.get_raster(fallback_value)

    return _create_empty_raster(flood_extent_provider)


def _create_empty_raster(flood_extent_provider: FloodExtentProvider) -> RasterData:
    """Create a zero-valued raster (indicating no flood) as fallback when no return period threshold is exceeded."""
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
