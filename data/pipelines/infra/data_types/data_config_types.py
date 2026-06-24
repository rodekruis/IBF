from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from pipelines.infra.data_types.enums import HazardType
from shared.country_data import CountryCodeIso3


class SourceTarget(StrEnum):
    """
    Which forecast data source to load for a run.
    Must match the "source_target" tag of a data source in the hazard config yaml
    """

    LIVE = "live"  # --mock flag not set, for production runs with live data
    MOCK_ALERT = "mock_alert"  # --mock 1
    MOCK_NO_ALERT = "mock_no_alert"  # --mock 0


class DataSource(StrEnum):
    """
    Enum of the different data sources that can be loaded.
    The string value (case insensitive) must match the "source" field in the config YAML.
    See the readme for more details on how to add to this.
    """

    ADMIN_AREA_IBF_API = "admin_area_ibf_api"
    ALERT_CONFIGS_IBF_API = "alert_configs_ibf_api"
    GLOFAS_STATIONS_IBF_API = "glofas_stations_ibf_api"
    POPULATION_IBF_API = "population_ibf_api"
    FLOOD_EXTENTS_SEED_REPO = "flood_extents_seed_repo"
    GLOFAS_DISCHARGE_FTP = "glofas_discharge_ftp"
    GLOFAS_DISCHARGE_SEED_REPO_ALERT = "glofas_discharge_seed_repo_alert"
    GLOFAS_DISCHARGE_SEED_REPO_NO_ALERT = "glofas_discharge_seed_repo_no_alert"
    TODO_ECMWF_FORECAST = "todo_ecmwf_forecast"
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

    Data Sources tagged with `source_target` are loaded only for the source target
    and skipped for --infra-only runs.  Untagged sources are loaded for any run.
    """

    country_code_iso_3: CountryCodeIso3
    source: DataSource
    hazard_type: HazardType
    source_target: SourceTarget | None = None


@dataclass
class CountryRunConfig:
    """
    Run config for a specific country's pipeline run.
    """

    country_code_iso_3: CountryCodeIso3
    target_admin_level: int
    data_sources: list[DataSourceConfig]


@dataclass
class PipelineRunConfig:
    """
    Top level class for a pipeline run config file.
    """

    hazard_type: HazardType
    country_configs: dict[CountryCodeIso3, CountryRunConfig]
