from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from pipelines.infra.data_types.data_config_types import DataSource


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

    # A PNG image loaded as bytes
    # Meta data may be loaded in the data container's metadata field
    PNG = "png"

    # an AdminAreasSet object
    ADMIN_AREA_SET = "admin_area_set"

    ALERT_CONFIG_LIST = "alert_config_list"

    # a dict of LocationPoints keyed by id
    LOCATION_POINT_DICT = "location_point_dict"

    # Generic types
    STRING = "string"
    BINARY = "binary"

    # Default value until the type is set by the loader
    UNSPECIFIED = "unspecified"


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
    metadata: dict[str, str | int | float | bool] = field(default_factory=dict)
