from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from pipelines.infra.data_types.enums import HazardType
from shared.country_data import CountryCodeIso3


class ScenarioType(StrEnum):
    """Infra-level override that replaces the hazard-specific forecast logic in
    forecast.py with a predetermined outcome. This is orthogonal to run_target:
    run_target selects the environment config (countries, data sources, output),
    while scenario controls *what the pipeline produces* without running any
    hazard logic."""

    NO_ALERT = "no-alert"
    ALERT = "alert"


@dataclass
class Scenario:
    type: ScenarioType
    issued_at: datetime | None = None


class RunTargetType(StrEnum):
    """
    Enum of the different types of run targets.
    The string value (case insensitive) must match the "run_target" field in the config YAML.
    Add to this as needed.
    """

    DEBUG = "debug"
    TEST = "test"
    PROD = "prod"


class DataSource(StrEnum):
    """
    Enum of the different data sources that can be loaded.
    The string value (case insensitive) must match the "source" field in the config YAML.
    See the readme for more details on how to add to this.
    """

    ADMIN_AREA_IBF_API = "admin_area_ibf_api"
    ALERT_CONFIGS_IBF_API = "alert_configs_ibf_api"
    GLOFAS_STATIONS_IBF_API = "glofas_stations_ibf_api"
    POPULATION_SEED_REPO = "population_seed_repo"
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

    country_code_iso_3: CountryCodeIso3
    source: DataSource
    hazard_type: HazardType


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
    scenario: Scenario | None = None


@dataclass
class PipelineRunConfig:
    """
    Top level class for a pipeline run config file.
    """

    run_target: RunTargetType
    hazard_type: HazardType
    country_configs: dict[CountryCodeIso3, CountryRunConfig]
