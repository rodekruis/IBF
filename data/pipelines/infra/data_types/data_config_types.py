from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from pipelines.infra.alert_types import HazardType
from shared.country_data import CountryCodeIso3


class RunTargetType(StrEnum):
    """
    Enum of the different types of run targets.
    The string value (case insensitive) must match the "run_target" field in the config YAML.
    Add to this as needed.
    """

    DEBUG = "debug"
    TEST = "test"
    PROD = "prod"


class DataSourceLocation(StrEnum):
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
    country_code_iso_3: CountryCodeIso3
    source: DataSourceLocation


@dataclass
class CountryRunConfig:
    """
    Run config for a specific country's pipeline run.
    """

    country_code_iso_3: CountryCodeIso3
    target_admin_level: int
    data_sources: list[DataSourceConfig]
    output_mode: OutputMode
    output_path: str


@dataclass
class PipelineRunConfig:
    """
    Top level class for a pipeline run config file.
    """

    run_target: RunTargetType
    hazard_type: HazardType
    country_configs: dict[CountryCodeIso3, CountryRunConfig]
