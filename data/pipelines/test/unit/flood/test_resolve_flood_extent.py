from __future__ import annotations

from pathlib import Path

import pytest

from pipelines.flood.compute_alert_extent import resolve_flood_extent_raster


def _touch_file(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    return str(path)


def test_returns_exact_matching_return_period(tmp_path: Path):
    path_10yr = _touch_file(tmp_path / "flood_map_uga_RP10.tif")
    path_50yr = _touch_file(tmp_path / "flood_map_uga_RP50.tif")

    selected = resolve_flood_extent_raster(
        flood_return_period="50yr",
        flood_extent_paths=[path_10yr, path_50yr],
    )

    assert selected == path_50yr


def test_falls_back_to_closest_lower_return_period(tmp_path: Path):
    path_5yr = _touch_file(tmp_path / "flood_map_uga_RP5.tif")
    path_25yr = _touch_file(tmp_path / "flood_map_uga_RP25.tif")

    selected = resolve_flood_extent_raster(
        flood_return_period="50yr",
        flood_extent_paths=[path_5yr, path_25yr],
    )

    assert selected == path_25yr


def test_falls_back_to_empty_when_no_lower_return_period_exists(tmp_path: Path):
    path_50yr = _touch_file(tmp_path / "flood_map_uga_RP50.tif")
    path_empty = _touch_file(tmp_path / "flood_map_uga_empty.tif")

    selected = resolve_flood_extent_raster(
        flood_return_period="10yr",
        flood_extent_paths=[path_50yr],
    )

    assert selected == path_empty


def test_ignores_missing_files_and_uses_existing_lower(tmp_path: Path):
    missing_25yr = str(tmp_path / "flood_map_uga_RP25.tif")
    path_10yr = _touch_file(tmp_path / "flood_map_uga_RP10.tif")

    selected = resolve_flood_extent_raster(
        flood_return_period="25yr",
        flood_extent_paths=[missing_25yr, path_10yr],
    )

    assert selected == path_10yr


def test_raises_when_no_raster_and_no_empty_fallback(tmp_path: Path):
    with pytest.raises(FileNotFoundError, match="no empty fallback raster was found"):
        resolve_flood_extent_raster(
            flood_return_period="10yr",
            flood_extent_paths=[str(tmp_path / "flood_map_uga_RP50.tif")],
        )