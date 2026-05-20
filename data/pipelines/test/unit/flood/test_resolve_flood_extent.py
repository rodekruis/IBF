from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from pipelines.flood.compute_alert_extent import (
    _resolve_flood_extent,
    compute_alert_extent,
)


def _touch_file(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    return str(path)


def _build_time_interval_severities(return_period: float):
    severity = SimpleNamespace(
        median_return_period=return_period,
    )
    return [severity]


def test_returns_exact_matching_return_period(tmp_path: Path):
    path_10yr = _touch_file(tmp_path / "flood_map_uga_RP10.tif")
    path_50yr = _touch_file(tmp_path / "flood_map_uga_RP50.tif")
    time_interval_severities = _build_time_interval_severities(50)

    selected = compute_alert_extent(
        time_interval_severities=time_interval_severities,
        flood_extent_paths=[path_10yr, path_50yr],
    )

    assert selected == path_50yr


def test_falls_back_to_closest_lower_return_period(tmp_path: Path):
    path_5yr = _touch_file(tmp_path / "flood_map_uga_RP5.tif")
    path_25yr = _touch_file(tmp_path / "flood_map_uga_RP25.tif")
    time_interval_severities = _build_time_interval_severities(50)

    selected = compute_alert_extent(
        time_interval_severities=time_interval_severities,
        flood_extent_paths=[path_5yr, path_25yr],
    )

    assert selected == path_25yr


def test_falls_back_to_empty_when_no_lower_return_period_exists(tmp_path: Path):
    path_50yr = _touch_file(tmp_path / "flood_map_uga_RP50.tif")
    path_empty = _touch_file(tmp_path / "flood_map_uga_empty.tif")
    time_interval_severities = _build_time_interval_severities(10)

    selected = compute_alert_extent(
        time_interval_severities=time_interval_severities,
        flood_extent_paths=[path_50yr],
    )

    assert selected == path_empty


def test_ignores_missing_files_and_uses_existing_lower(tmp_path: Path):
    missing_50yr = str(tmp_path / "flood_map_uga_RP50.tif")
    path_10yr = _touch_file(tmp_path / "flood_map_uga_RP10.tif")
    time_interval_severities = _build_time_interval_severities(25)

    selected = compute_alert_extent(
        time_interval_severities=time_interval_severities,
        flood_extent_paths=[missing_50yr, path_10yr],
    )

    assert selected == path_10yr


def test_raises_when_no_raster_and_no_empty_fallback(tmp_path: Path):
    time_interval_severities = _build_time_interval_severities(10)

    with pytest.raises(FileNotFoundError, match="no empty fallback raster was found"):
        compute_alert_extent(
            time_interval_severities=time_interval_severities,
            flood_extent_paths=[str(tmp_path / "flood_map_uga_RP50.tif")],
        )


def test_private_resolver_returns_exact_return_period_when_available(tmp_path: Path):
    path_20yr = _touch_file(tmp_path / "flood_map_uga_rp20.tif")
    path_50yr = _touch_file(tmp_path / "flood_map_uga_rp50.tif")

    selected = _resolve_flood_extent(
        return_period=20,
        flood_extent_paths=[path_20yr, path_50yr],
    )

    assert selected == path_20yr
