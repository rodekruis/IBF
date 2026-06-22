from __future__ import annotations

from unittest.mock import patch

import numpy as np
import pytest
from pipelines.flood.compute_flood_depth import (
    _resolve_flood_extent,
    compute_flood_depth,
)
from pipelines.flood.determine_alerts import TimeIntervalSeverity
from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.loaded_data_types import RasterData
from rasterio.transform import from_origin

_MOCK_RASTER = RasterData(
    array=np.ones((2, 2), dtype=np.float32),
    transform=from_origin(0, 2, 1, 1),
    crs="EPSG:4326",
    nodata=0.0,
)


def _make_provider(return_periods: list[int]) -> FloodExtentProvider:
    provider = FloodExtentProvider(
        available_return_periods=return_periods,
        _base_url="http://mock/",
        _country="UGA",
    )
    return provider


def _build_time_interval_severities(
    return_period: float,
) -> list[TimeIntervalSeverity]:
    return [
        TimeIntervalSeverity(
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
            flood_extent_provider=provider,
        )

    mock.assert_called_once_with(50)
    assert selected is _MOCK_RASTER


def test_falls_back_to_closest_lower_return_period():
    provider = _make_provider([5, 25])
    time_interval_severities = _build_time_interval_severities(50)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_extent_provider=provider,
        )

    mock.assert_called_once_with(25)
    assert selected is _MOCK_RASTER


def test_falls_back_to_empty_when_no_lower_return_period_exists():
    provider = _make_provider([50])
    time_interval_severities = _build_time_interval_severities(10)

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_extent_provider=provider,
        )

    mock.assert_called_once_with(50)
    assert np.all(selected.array == 0)
    assert selected.transform == _MOCK_RASTER.transform
    assert selected.crs == _MOCK_RASTER.crs
    assert selected.nodata == _MOCK_RASTER.nodata


def test_raises_when_no_available_return_periods():
    provider = _make_provider([])
    time_interval_severities = _build_time_interval_severities(10)

    with pytest.raises(FileNotFoundError, match="no available return period"):
        compute_flood_depth(
            time_interval_severities=time_interval_severities,
            flood_extent_provider=provider,
        )


def test_private_resolver_returns_exact_return_period():
    provider = _make_provider([20, 50])

    with patch.object(provider, "get_raster", return_value=_MOCK_RASTER) as mock:
        selected = _resolve_flood_extent(
            return_period=20,
            flood_extent_provider=provider,
        )

    mock.assert_called_once_with(20)
    assert selected is _MOCK_RASTER
