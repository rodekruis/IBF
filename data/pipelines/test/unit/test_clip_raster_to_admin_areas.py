from __future__ import annotations

import numpy as np
from rasterio.transform import from_origin

from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.exposure import clip_raster_to_admin_areas

_CRS = "EPSG:4326"


def _make_admin_area(pcode: str, coordinates: list) -> AdminArea:
    return AdminArea(
        properties=AdminAreaProperties(
            pcode=pcode, name=pcode, admin_level=1, country_code="PC"
        ),
        geometry_type="Polygon",
        coordinates=coordinates,
    )


def _build_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_areas={
            "PC001": _make_admin_area(
                "PC001", [[[0.0, 0.0], [0.0, 2.0], [1.0, 2.0], [1.0, 0.0], [0.0, 0.0]]]
            ),
            "PC002": _make_admin_area(
                "PC002", [[[1.0, 0.0], [1.0, 2.0], [2.0, 2.0], [2.0, 0.0], [1.0, 0.0]]]
            ),
        }
    )


def _make_raster() -> RasterData:
    return RasterData(
        array=np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs=_CRS,
        nodata=-9999.0,
    )


def test_clips_to_a_single_place_code():
    clipped = clip_raster_to_admin_areas(
        ["PC001"], _build_admin_areas(), _make_raster()
    )
    assert clipped.array.shape == (2, 1)


def test_unions_multiple_place_codes_before_clipping():
    clipped = clip_raster_to_admin_areas(
        ["PC001", "PC002"], _build_admin_areas(), _make_raster()
    )
    assert clipped.array.shape == (2, 2)


def test_ignores_place_codes_not_in_admin_areas():
    clipped = clip_raster_to_admin_areas(
        ["PC001", "UNKNOWN"], _build_admin_areas(), _make_raster()
    )
    assert clipped.array.shape == (2, 1)


def test_returns_original_raster_when_no_place_codes_match():
    raster = _make_raster()
    clipped = clip_raster_to_admin_areas(["UNKNOWN"], _build_admin_areas(), raster)
    assert clipped is raster
