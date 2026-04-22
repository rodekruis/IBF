from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from pipelines.flood.determine_population_exposed import (
    clip_flood_extent_to_admin_areas,
    extract_population_within_flood_extent,
)
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)


def _create_raster(path: Path, data: np.ndarray, nodata: float = -9999.0) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=data.dtype,
        crs="EPSG:4326",
        transform=from_origin(0, 2, 1, 1),
        nodata=nodata,
    ) as dataset:
        dataset.write(data, 1)
    return str(path)


def _build_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_level=1,
        admin_areas={
            "PC001": AdminArea(
                properties=AdminAreaProperties(
                    pcode="PC001",
                    name="Test Area",
                ),
                geometry_type="Polygon",
                coordinates=[[
                    [0.0, 0.0],
                    [0.0, 2.0],
                    [2.0, 2.0],
                    [2.0, 0.0],
                    [0.0, 0.0],
                ]],
            )
        },
    )


def _build_partial_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_level=1,
        admin_areas={
            "PC001": AdminArea(
                properties=AdminAreaProperties(
                    pcode="PC001",
                    name="Partial Test Area",
                ),
                geometry_type="Polygon",
                coordinates=[[
                    [0.0, 1.0],
                    [0.0, 2.0],
                    [1.0, 2.0],
                    [1.0, 1.0],
                    [0.0, 1.0],
                ]],
            )
        },
    )


def test_extract_population_within_flood_extent_sums_only_flooded_pixels(
    tmp_path: Path,
):
    population_path = _create_raster(
        tmp_path / "population.tif",
        np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32),
    )
    flood_extent_path = _create_raster(
        tmp_path / "flood_extent.tif",
        np.array([[0, 5], [2, 0]], dtype=np.uint8),
        nodata=0,
    )

    population = extract_population_within_flood_extent(
        place_codes=["PC001"],
        admin_areas=_build_admin_areas(),
        population_raster_path=population_path,
        flood_extent_raster_path=flood_extent_path,
    )

    assert population == {"PC001": 50.0}


def test_extract_population_within_flood_extent_returns_zero_for_empty_extent(
    tmp_path: Path,
):
    population_path = _create_raster(
        tmp_path / "population.tif",
        np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32),
    )
    flood_extent_path = _create_raster(
        tmp_path / "flood_extent_empty.tif",
        np.zeros((2, 2), dtype=np.uint8),
        nodata=0,
    )

    population = extract_population_within_flood_extent(
        place_codes=["PC001"],
        admin_areas=_build_admin_areas(),
        population_raster_path=population_path,
        flood_extent_raster_path=flood_extent_path,
    )

    assert population == {"PC001": 0.0}


def test_clip_flood_extent_to_admin_areas_creates_station_specific_clipped_raster(
    tmp_path: Path,
):
    flood_extent_path = _create_raster(
        tmp_path / "flood_extent.tif",
        np.array([[1, 2], [3, 4]], dtype=np.uint8),
        nodata=0,
    )

    clipped_path = clip_flood_extent_to_admin_areas(
        place_codes=["PC001"],
        admin_areas=_build_partial_admin_areas(),
        flood_extent_raster_path=flood_extent_path,
        station_code="station_001",
    )

    assert Path(clipped_path).name == "alert_extent_station_001.tif"

    with rasterio.open(clipped_path) as clipped_raster:
        clipped_data = clipped_raster.read(1)
        assert clipped_data.shape == (1, 1)
        assert clipped_data[0, 0] == 1