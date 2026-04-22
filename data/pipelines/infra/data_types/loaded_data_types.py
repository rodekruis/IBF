from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from pipelines.infra.data_types.data_config_types import DataSource


@dataclass
class ClimateRegion:
    id: str
    name: str
    seasons: list[str]
    place_codes: list[str]

    @staticmethod
    def from_raw(raw: dict[str, object]) -> ClimateRegion:
        raw_seasons = raw.get("seasons")
        raw_place_codes = raw.get("place_codes")
        return ClimateRegion(
            id=str(raw["id"]),
            name=str(raw["name"]),
            seasons=(
                [str(s) for s in raw_seasons] if isinstance(raw_seasons, list) else []
            ),
            place_codes=(
                [str(p) for p in raw_place_codes]
                if isinstance(raw_place_codes, list)
                else []
            ),
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

    # a dict of LocationPoints keyed by id
    LOCATION_POINT_DICT = "location_point_dict"

    CLIMATE_REGION_LIST = "climate_region_list"

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
