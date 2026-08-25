from __future__ import annotations

from unittest.mock import patch

import numpy as np
from pipelines.constants import DEFAULT_CRS, POPULATION_NODATA_VALUE
from pipelines.flood.compute_flood_depth import (
    _resolve_flood_depth_raster,
    compute_flood_depth,
)
from pipelines.flood.determine_alerts import TimeIntervalReturnPeriodSeverity
from pipelines.infra.data_types.flood_depth_provider import FloodDepthProvider
from pipelines.infra.data_types.loaded_data_types import RasterData
from rasterio.transform import from_origin

_MOCK_RASTER = RasterData(
    array=np.ones((2, 2), dtype=np.float32),
    transform=from_origin(0, 2, 1, 1),
    crs=DEFAULT_CRS,
    nodata=POPULATION_NODATA_VALUE,
)


def _make_provider(return_periods: list[int]) -> FloodDepthProvider:
    provider = FloodDepthProvider(
        available_return_periods=return_periods,
        base_url="http://mock/",
        country="UGA",
    )
    return provider


def _build_time_interval_severities(
    return_period: float,
) -> list[TimeIntervalReturnPeriodSeverity]:
    return [
        TimeIntervalReturnPeriodSeverity(
            time_interval_start="2026-04-01",
            time_interval_end="2026-04-02",
            median_return_period=return_period,
            ensemble_return_periods=[return_period],
        )
    ]


def test_returns_exact_matching_return_period():
    provider = _make_provider([10, 50])
    time_interval_severities = _build_time_interval_severities(50)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(50)
    assert selected is _MOCK_RASTER


def test_falls_back_to_closest_lower_return_period():
    provider = _make_provider([5, 25])
    time_interval_severities = _build_time_interval_severities(50)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(25)
    assert selected is _MOCK_RASTER


def test_falls_back_to_lowest_available_when_no_lower_return_period_exists():
    provider = _make_provider([50])
    time_interval_severities = _build_time_interval_severities(10)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(50)
    assert selected is _MOCK_RASTER


def test_falls_back_to_lowest_available_among_multiple_maps():
    provider = _make_provider([10, 50, 100])
    time_interval_severities = _build_time_interval_severities(5)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(10)
    assert selected is _MOCK_RASTER


def test_returns_empty_raster_when_no_threshold_exceeded():
    provider = _make_provider([10, 50])
    time_interval_severities = _build_time_interval_severities(0)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(10)
    assert np.all(selected.array == 0)


def test_non_integer_return_period_falls_back_to_closest_lower():
    provider = _make_provider([5, 10, 50])
    time_interval_severities = _build_time_interval_severities(7.5)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(5)
    assert selected is _MOCK_RASTER


def test_private_resolver_returns_exact_return_period():
    provider = _make_provider([20, 50])

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = _resolve_flood_depth_raster(
            return_period=20,
            flood_depth_provider=provider,
        )

    mock.assert_called_once_with(20)
    assert selected is _MOCK_RASTER
