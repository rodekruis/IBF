"""
Functions for fetching, loading, and parsing data.
When a new data source is added, this is the main file that needs to be updated.
See the readme for more details on adding new data sources.
"""

import logging
import os

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import Layer
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
)
from pipelines.infra.data_types.loaded_data_types import (
    AlertConfig,
    DataType,
    LoadedDataSource,
)
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.dummy_data import DUMMY_DATA
from shared.download_helpers import download_json_source, download_object

logger = logging.getLogger(__name__)

SEED_REPO_POPULATION_DATA_PNG_PATH = "/raster-data/population/data-png/"


def _get_seed_repo_uri() -> str:
    var_name = "GITHUB_DATA_BASE_URL"
    uri = os.environ.get(var_name)
    if not uri:
        raise ValueError(f"{var_name} environment variable could not be loaded.")
    return uri


def load_data_container(
    country_config: CountryRunConfig,
    data_config: DataSourceConfig,
    container: LoadedDataSource,
    api_client: ApiClient,
):

    match data_config.source:
        case DataSource.ADMIN_AREA_IBF_API:
            return _load_ibf_api_admin_areas(
                container,
                api_client,
                data_config.country_code_iso_3,
                country_config.target_admin_level,
            )
        case DataSource.ALERT_CONFIGS_IBF_API:
            return _load_ibf_api_alert_configs(
                container,
                api_client,
                data_config,
            )
        case DataSource.GLOFAS_STATIONS_IBF_API:
            return _load_ibf_api_glofas_stations(
                container,
                api_client,
                data_config,
            )
        case DataSource.POPULATION_SEED_REPO:
            return _load_seed_repo_population_data(data_config, container)
        case DataSource.TODO_ECMWF_FORECAST:
            return _load_ecmwf_forecast(data_config, container)
        case DataSource.TODO_GLOFAS_DISCHARGE:
            return _load_glofas_discharge(data_config, container)
        case DataSource.TODO_DATA_SOURCE:
            container.error = "Data source not yet configured"
            raise NotImplementedError("Data source not yet configured")
        case _:
            container.error = f"Unknown source type: '{data_config.source}'"
            raise ValueError(f"Unknown source type: '{data_config.source}'")


def _load_ibf_api_admin_areas(
    container: LoadedDataSource,
    api_client: ApiClient,
    country_code_iso_3: str,
    target_admin_level: int,
):
    container.data_type = DataType.ADMIN_AREA_SET
    data = api_client.get_admin_areas(country_code_iso_3, target_admin_level)
    if not data:
        raise ValueError(
            f"No admin areas returned from API for {country_code_iso_3} at level {target_admin_level}"
        )
    container.data = AdminAreasSet.from_api(data)


def _load_ibf_api_alert_configs(
    container: LoadedDataSource,
    api_client: ApiClient,
    data_config: DataSourceConfig,
):
    container.data_type = DataType.ALERT_CONFIG_LIST
    data = api_client.get_alert_configs(
        data_config.country_code_iso_3,
        data_config.hazard_type.value,
    )
    container.data = [AlertConfig.from_api(item) for item in data]


def _load_ibf_api_glofas_stations(
    container: LoadedDataSource,
    api_client: ApiClient,
    data_config: DataSourceConfig,
):
    container.data_type = DataType.LOCATION_POINT_DICT
    data = api_client.get_geo_features(
        data_config.country_code_iso_3,
        Layer.GLOFAS_STATIONS,
    )
    stations: dict[str, LocationPoint] = {}
    for item in data:
        attributes = item.get("attributes", {})
        station = LocationPoint(
            name=attributes.get("name", ""),
            lat=item["geometry"]["coordinates"][1],
            lon=item["geometry"]["coordinates"][0],
            id=item["referenceId"],
            attributes=attributes,
        )
        stations[station.id] = station
    container.data = stations


def _load_seed_repo_population_data(
    config: DataSourceConfig, container: LoadedDataSource
):
    container.data_type = DataType.PNG

    png_filename = f"{config.country_code_iso_3}_population.png"
    json_filename = f"{config.country_code_iso_3}_population_metadata.json"
    png_uri = _get_seed_repo_uri() + SEED_REPO_POPULATION_DATA_PNG_PATH + png_filename
    json_uri = _get_seed_repo_uri() + SEED_REPO_POPULATION_DATA_PNG_PATH + json_filename

    container.data = download_object(png_uri)
    if container.data is None:
        container.error = f"Failed to download PNG data from '{png_uri}'"
        raise ValueError(container.error)

    json_data = download_json_source(json_uri, check_count=False)
    if json_data is None:
        container.error = f"Failed to download metadata JSON from '{json_uri}'"
        raise ValueError(container.error)

    container.metadata = {
        "crs": json_data["crs"],
        "transform": json_data["transform"],
        "width": json_data["width"],
        "height": json_data["height"],
        "bounds": json_data["bounds"],
        "res": json_data["res"],
        "scales": json_data["scales"],
        "offsets": json_data["offsets"],
        "count": json_data["count"],
        "max_value": json_data["max_value"],
        "nodata": json_data["nodata"],
        "dtype": json_data["dtype"],
    }


def _load_ecmwf_forecast(config: DataSourceConfig, container: LoadedDataSource):
    # TODO: Set the type correctly once real data is loaded
    container.data_type = DataType.UNSPECIFIED
    container.data = _load_dummy_data(config)
    if container.data is None:
        container.error = f"No dummy data found for source '{config.source}'"


def _load_glofas_discharge(config: DataSourceConfig, container: LoadedDataSource):
    # TODO: Set the type correctly once real data is loaded
    container.data_type = DataType.UNSPECIFIED
    container.data = _load_dummy_data(config)
    if container.data is None:
        container.error = f"No dummy data found for source '{config.source}'"


def _load_dummy_data(source_config: DataSourceConfig) -> object:
    if source_config.source in DUMMY_DATA:
        return DUMMY_DATA[source_config.source]
    return None
