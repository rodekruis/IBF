from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from shared.country_data import CountryCode

from pipelines.infra.alert_types import HazardType


class RunTargetType(StrEnum):
    """
    Enum of the different types of run targets.
    The string value (case insensitive) must match the "run_target" field in the config YAML.
    Add to this as needed.
    """

    DEBUG = "debug"
    TEST = "test"
    PROD = "prod"


class DataType(StrEnum):
    """
    Enum of the different types of data that can be loaded.
    This is set during data loading.
    See the readme for more details.
    """

    # A PNG image loaded as bytes
    # Meta data may be loaded in the data container's metadata field
    PNG = "png"

    # a dict of AdminBoundariesContainers keyed by admin level
    ADMIN_BOUNDARIES_DICT = "admin_boundaries_dict"

    # a dict of LocationPoints keyed by id
    LOCATION_POINT_DICT = "location_point_dict"

    # Generic types
    STRING = "string"
    BINARY = "binary"

    # Default value until the type is set by the loader
    UNSPECIFIED = "unspecified"


class DataSource(StrEnum):
    """
    Enum of the different data sources that can be loaded.
    The string value (case insensitive) must match the "source" field in the config YAML.
    See the readme for more details on how to add to this.
    """

    SEED_DATA_REPO_ADMIN = "seed_data_repo_admin"
    SEED_DATA_REPO_POPULATION = "seed_data_repo_population"
    SEED_DATA_REPO_GLOFAS_STATIONS = "seed_data_repo_glofas_stations"
    IBF_API_CLIMATE_REGIONS = "ibf_api_climate_regions"
    TODO_ECMWF_FORECAST = "todo_ecmwf_forecast"
    TODO_GLOFAS_DISCHARGE = "todo_glofas_discharge"
    TODO_DATA_SOURCE = "todo_data_source"


class OutputMode(StrEnum):
    """
    Targets of where to output pipeline results.
    """

    LOCAL = "local"
    API = "api"


@dataclass
class DataSourceConfig:
    """
    Config for a specific data source, as described in the config file.
    """

    name: str
    iso_3_code: CountryCode
    source: DataSource


@dataclass
class CountryConfig:
    """
    Run config for a specific country's pipeline run.
    """

    iso_3_code: CountryCode
    target_admin_level: int
    data_sources: list[DataSourceConfig]
    output_mode: OutputMode
    output_path: str


@dataclass
class RunTargetConfig:
    """
    Top level class for a pipeline run config file.
    """

    run_target: RunTargetType
    hazard_type: HazardType
    country_configs: dict[CountryCode, CountryConfig]


@dataclass
class LocationPoint:
    """
    A generic class used for point locations
    """

    name: str
    lat: float
    lon: float
    id: str


@dataclass
class DataSourceContainer:
    """
    The main container for data loaded.
    These are provided to the hazard logic pipeline code.
    """

    name: str
    data_type: DataType
    data_source: DataSource
    data: object | None = None
    error: str | None = None
    metadata: dict[str, str | int | float | bool] = field(default_factory=dict)
