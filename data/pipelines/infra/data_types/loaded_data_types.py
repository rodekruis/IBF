from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from pipelines.infra.data_types.data_config_types import DataSource
from rasterio.transform import Affine


@dataclass
class AlertConfig:
    spatial_extent_name: str
    spatial_extent_place_codes: list[str]
    temporal_extents: list[dict[str, list]]

    @staticmethod
    def from_api(raw: dict) -> AlertConfig:
        return AlertConfig(
            spatial_extent_name=str(raw["spatialExtentName"]),
            spatial_extent_place_codes=[
                str(p) for p in raw.get("spatialExtentPlaceCodes", [])
            ],
            temporal_extents=raw.get("temporalExtents", []),
        )


class DataType(StrEnum):
    """
    Enum of the different types of data that can be loaded.
    This is set during data loading.
    See the readme for more details.
    """

    # In-memory raster data (array + geo metadata)
    RASTER_DATA = "raster_data"

    # A FloodExtentProvider that lazily fetches flood extent rasters on demand
    FLOOD_EXTENT_PROVIDER = "flood_extent_provider"

    # an AdminAreasSet object
    ADMIN_AREA_SET = "admin_area_set"

    ALERT_CONFIG_LIST = "alert_config_list"

    # a dict of LocationPoints keyed by id
    LOCATION_POINT_DICT = "location_point_dict"

    # Generic types
    BINARY = "binary"
    JSON_LIST = "json_list"

    # Default value until the type is set by the loader
    UNSPECIFIED = "unspecified"


@dataclass
class RasterData:
    array: np.ndarray
    transform: Affine
    crs: str
    nodata: float


@dataclass
class LoadedDataSource:
    """
    The main container for data loaded.
    These are provided to the hazard logic pipeline code.
    """

    data_type: DataType
    data_source: DataSource
    data: object | None = None
    error: str | None = None
