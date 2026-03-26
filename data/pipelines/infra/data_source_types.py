from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from shared.country_data import CountryCode

from pipelines.infra.alert_types import HazardType


class RunTargetType(StrEnum):
    DEBUG = "debug"
    TEST = "test"
    PROD = "prod"


class DataType(StrEnum):
    # A PNG image loaded as bytes
    # Meta data may be loaded in the data container's metadata field
    PNG = "png"

    # a dict of admin boundaries keyed by admin
    ADMIN_BOUNDARIES_DICT = "admin_boundaries_dict"

    # a dict of location points keyed by id
    LOCATION_POINT_DICT = "location_point_dict"

    # Generic types
    STRING = "string"
    BINARY = "binary"

    # Default value until the type is determined
    NONE = "none"


class DataSource(StrEnum):
    SEED_DATA_REPO_ADMIN = "seed_data_repo_admin"
    SEED_DATA_REPO_POPULATION = "seed_data_repo_population"
    SEED_DATA_REPO_GLOFAS_STATIONS = "seed_data_repo_glofas_stations"
    IBF_API_CLIMATE_REGIONS = "ibf_api_climate_regions"
    TODO_DATA_SOURCE = "todo_data_source"


class OutputMode(StrEnum):
    LOCAL = "local"
    API = "api"


@dataclass
class DataSourceConfig:
    name: str
    iso_3_code: CountryCode
    source: DataSource


@dataclass
class CountryConfig:
    iso_3_code: CountryCode
    target_admin_level: int
    data_sources: list[DataSourceConfig]
    output_mode: OutputMode
    output_path: str


@dataclass
class RunTargetConfig:
    run_target: RunTargetType
    hazard_type: HazardType
    country_configs: dict[CountryCode, CountryConfig]
