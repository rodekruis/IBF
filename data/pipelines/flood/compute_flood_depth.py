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

    return _resolve_flood_depth_raster(
        return_period=return_period,
        flood_depth_provider=flood_depth_provider,
    )


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


def _resolve_flood_depth_raster(
    return_period: float | None,
    flood_depth_provider: FloodDepthProvider,
) -> RasterData:
    """
    Resolve the flood depth raster using this order:
    1. Highest available return period that is <= the forecast return period.
    2. Lowest available return period overall (when forecast RP is below all available maps).
    3. Empty fallback raster (when no threshold is exceeded).
    """
    available = flood_depth_provider.available_return_periods

    if return_period is not None:
        highest_below_or_equal_to_forecast = max(
            (rp for rp in available if rp <= return_period),
            default=None,
        )
        if highest_below_or_equal_to_forecast is not None:
            return flood_depth_provider.get_raster(highest_below_or_equal_to_forecast)

        lowest_available_overall = min(available)
        return flood_depth_provider.get_raster(lowest_available_overall)

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
