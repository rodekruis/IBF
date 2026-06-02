from __future__ import annotations

import numpy as np
from pipelines.flood.determine_exposure import (
    clip_flood_extent_to_admin_areas,
    compute_population_exposed,
    determine_spatial_extent,
)
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.exposure import aggregate_population_exposed
from rasterio.transform import from_origin


def _build_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_areas={
            "PC001": AdminArea(
                properties=AdminAreaProperties(
                    pcode="PC001",
                    name="Test Area",
                    admin_level=1,
                    country_code="PC",
                ),
                geometry_type="Polygon",
                coordinates=[
                    [
                        [0.0, 0.0],
                        [0.0, 2.0],
                        [2.0, 2.0],
                        [2.0, 0.0],
                        [0.0, 0.0],
                    ]
                ],
            )
        },
    )


def _build_partial_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_areas={
            "PC001": AdminArea(
                properties=AdminAreaProperties(
                    pcode="PC001",
                    name="Partial Test Area",
                    admin_level=1,
                    country_code="PC",
                ),
                geometry_type="Polygon",
                coordinates=[
                    [
                        [0.0, 1.0],
                        [0.0, 2.0],
                        [1.0, 2.0],
                        [1.0, 1.0],
                        [0.0, 1.0],
                    ]
                ],
            )
        },
    )


def test_compute_population_exposed_sums_only_flooded_pixels():
    population_data = RasterData(
        array=np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=-9999.0,
    )
    flood_extent_data = RasterData(
        array=np.array([[0, 5], [2, 0]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=0.0,
    )

    population_exposed_raster = compute_population_exposed(
        population_raster=population_data,
        flood_extent_raster=flood_extent_data,
    )
    assert population_exposed_raster is not None

    population = aggregate_population_exposed(
        population_exposed_raster=population_exposed_raster,
        place_codes_exposed=["PC001"],
        admin_areas=_build_admin_areas(),
    )

    assert population == {"PC001": 50.0}


def test_compute_population_exposed_returns_zero_for_empty_extent():
    population_data = RasterData(
        array=np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=-9999.0,
    )
    flood_extent_data = RasterData(
        array=np.zeros((2, 2), dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=0.0,
    )

    population_exposed_raster = compute_population_exposed(
        population_raster=population_data,
        flood_extent_raster=flood_extent_data,
    )
    assert population_exposed_raster is not None

    population = aggregate_population_exposed(
        population_exposed_raster=population_exposed_raster,
        place_codes_exposed=["PC001"],
        admin_areas=_build_admin_areas(),
    )

    assert population == {"PC001": 0.0}


def test_clip_flood_extent_to_admin_areas_clips_to_geometry():
    flood_extent_data = RasterData(
        array=np.array([[1, 2], [3, 4]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=0.0,
    )

    clipped = clip_flood_extent_to_admin_areas(
        place_codes=["PC001"],
        admin_areas=_build_partial_admin_areas(),
        flood_extent_raster=flood_extent_data,
        station_code="station_001",
    )

    assert clipped.array.shape == (1, 1)
    assert clipped.array[0, 0] == 1.0


def _build_station(station_id: str = "station_001") -> LocationPoint:
    return LocationPoint(name="Test Station", lat=1.0, lon=1.0, id=station_id)


def test_determine_spatial_extent_filters_to_valid_place_codes():
    flood_extent_data = RasterData(
        array=np.array([[1, 2], [3, 4]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=0.0,
    )

    admin_areas = _build_admin_areas()

    clipped, valid_codes = determine_spatial_extent(
        station=_build_station(),
        station_place_codes=["PC001", "INVALID_CODE"],
        admin_areas=admin_areas,
        flood_extent_raster=flood_extent_data,
    )

    assert valid_codes == ["PC001"]
    assert clipped is not None


def test_determine_spatial_extent_returns_early_when_all_place_codes_invalid():
    flood_extent_data = RasterData(
        array=np.array([[1, 2], [3, 4]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=0.0,
    )

    admin_areas = _build_admin_areas()

    clipped, valid_codes = determine_spatial_extent(
        station=_build_station(),
        station_place_codes=["INVALID_1", "INVALID_2"],
        admin_areas=admin_areas,
        flood_extent_raster=flood_extent_data,
    )

    assert valid_codes == []
    assert clipped is None


def test_determine_spatial_extent_returns_early_when_place_codes_empty():
    flood_extent_data = RasterData(
        array=np.array([[1, 2], [3, 4]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=0.0,
    )

    admin_areas = _build_admin_areas()

    clipped, valid_codes = determine_spatial_extent(
        station=_build_station(),
        station_place_codes=[],
        admin_areas=admin_areas,
        flood_extent_raster=flood_extent_data,
    )

    assert valid_codes == []
    assert clipped is None
