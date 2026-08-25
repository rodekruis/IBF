from __future__ import annotations

import numpy as np

from pipelines.flood.determine_alerts import TimeIntervalReturnPeriodSeverity
from pipelines.infra.data_types.flood_depth_provider import FloodDepthProvider
from pipelines.infra.data_types.loaded_data_types import RasterData


def compute_flood_depth(
    time_interval_severities: list[TimeIntervalReturnPeriodSeverity],
    flood_depth_provider: FloodDepthProvider,
) -> RasterData:
    """
    Compute the flood depth raster for the alert station by resolving the appropriate return period raster.
    Returns the flood depth as in-memory raster data.
    """

    return_period = _resolve_requested_return_period_value(time_interval_severities)

    flood_depth = _resolve_flood_depth(
        return_period=return_period,
        flood_depth_provider=flood_depth_provider,
    )
    return flood_depth


def _resolve_requested_return_period_value(
    time_interval_severities: list[TimeIntervalReturnPeriodSeverity],
) -> float | None:
    highest_return_period = max(
        time_interval_severities,
        key=lambda s: s.median_return_period,
    ).median_return_period

    if highest_return_period <= 0:
        return None

    return float(highest_return_period)


def _resolve_flood_depth(
    return_period: float | None,
    flood_depth_provider: FloodDepthProvider,
) -> RasterData:
    """
    Resolve the flood depth raster using this order:
    1. Exact return period raster.
    2. Closest lower-or-equal available return period raster.
    3. Empty fallback raster.
    """
    available = flood_depth_provider.available_return_periods

    if return_period is not None:
        exact_match = (
            int(return_period) if return_period == int(return_period) else None
        )
        if exact_match is not None and exact_match in available:
            return flood_depth_provider.get_raster(exact_match)

        fallback_value = max(
            (rp for rp in available if rp <= return_period),
            default=None,
        )
        if fallback_value is not None:
            return flood_depth_provider.get_raster(fallback_value)

    return _create_empty_raster(flood_depth_provider)


def _create_empty_raster(flood_depth_provider: FloodDepthProvider) -> RasterData:
    """Create a zero-valued raster (indicating no flood) as fallback when no return period threshold is exceeded."""
    if not flood_depth_provider.available_return_periods:
        raise FileNotFoundError(
            "Could not resolve flood depth raster: no available return period "
            "rasters to derive an empty fallback from."
        )

    reference_return_period = flood_depth_provider.available_return_periods[0]
    reference_raster = flood_depth_provider.get_raster(reference_return_period)

    empty_array = np.zeros_like(reference_raster.array)

    return RasterData(
        array=empty_array,
        transform=reference_raster.transform,
        crs=reference_raster.crs,
        nodata=reference_raster.nodata,
    )
