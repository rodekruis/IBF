"""Load lake polygons from a locally cached download of the lake source (currently HydroLAKES)."""

import math
from pathlib import Path

import fiona
from data_management.seed_data_management.admin_areas.admin_area_dataset_helpers import (
    Bounds,
)
from fiona.model import Feature
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shared.download_helpers import download_file

LAKES_SOURCE_URL = (
    "https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10.gdb.zip"
)
LAKES_LAYER_PATH = "HydroLAKES_polys_v10.gdb"
LAKES_CACHE_DIRECTORY = Path(__file__).parents[2] / "data" / "lakes"
KILOMETRES_PER_DEGREE = 111.32


def load_lake_geometries(
    bounds: Bounds, minimum_area_km2: float = 0
) -> list[BaseGeometry]:
    lakes_path = download_lakes()
    with fiona.open(f"zip://{lakes_path}!{LAKES_LAYER_PATH}") as lakes:
        return [
            shape(lake.geometry)
            for lake in lakes.filter(bbox=bounds)
            if get_lake_area_km2(lake) >= minimum_area_km2
        ]


def download_lakes() -> Path:
    return download_file(
        LAKES_SOURCE_URL, LAKES_CACHE_DIRECTORY / Path(LAKES_SOURCE_URL).name
    )


def get_lake_area_km2(lake: Feature) -> float:
    # The geodatabase stores Shape_Area in square degrees, so scale it at the lake's latitude.
    latitude_scale = math.cos(math.radians(lake.properties["Pour_lat"]))
    return lake.properties["Shape_Area"] * KILOMETRES_PER_DEGREE**2 * latitude_scale
