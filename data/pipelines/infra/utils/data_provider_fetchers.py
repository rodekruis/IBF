"""
Functions for fetching, loading, and parsing data.
When a new data source is added, this is the main file that needs to be updated.
See the readme for more details on adding new data sources.
"""

import logging
import os

import numpy as np
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
)
from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.loaded_data_types import (
    DataType,
    LoadedDataSource,
    RasterData,
)
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.dummy_data import DUMMY_DATA
from rasterio.transform import Affine
from shared.download_helpers import download_json_source, download_object
from shared.image_helpers import rgba_png_to_float_array

logger = logging.getLogger(__name__)

SEED_REPO_POPULATION_DATA_PNG_PATH = "/raster-data/population/data-png/"
SEED_REPO_FLOOD_EXTENTS_RGBA_PATH = "/raster-data/flood-extents/rgba/"


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
        # --- Generic sources ---
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
        case DataSource.POPULATION_SEED_REPO:
            return _load_seed_repo_population_data(data_config, container)
        case DataSource.FLOOD_EXTENTS_SEED_REPO:
            return _load_seed_repo_flood_extents(data_config, container)

        # --- Flood sources ---
        case DataSource.GLOFAS_STATIONS_IBF_API:
            return _load_ibf_api_glofas_stations(
                container,
                api_client,
                data_config,
            )
        case DataSource.GLOFAS_STATION_THRESHOLDS_SEED_REPO:
            return _load_glofas_station_thresholds(data_config, container)
        case DataSource.TODO_GLOFAS_DISCHARGE:
            return _load_glofas_discharge(data_config, container)

        # --- Drought sources ---
        case DataSource.TODO_ECMWF_FORECAST:
            return _load_ecmwf_forecast(data_config, container)

        # --- Fallback ---
        case DataSource.TODO_DATA_SOURCE:
            container.error = "Data source not yet configured"
            raise NotImplementedError("Data source not yet configured")
        case _:
            container.error = f"Unknown source type: '{data_config.source}'"
            raise ValueError(f"Unknown source type: '{data_config.source}'")


# =============================================================================
# Generic source loaders
# =============================================================================


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
    container.data = api_client.get_alert_configs(
        data_config.country_code_iso_3,
        data_config.hazard_type.value,
    )


# TODO AB#42339: switch to loading population raster from IBF API (geo-features).
def _load_seed_repo_population_data(
    config: DataSourceConfig, container: LoadedDataSource
):
    container.data_type = DataType.RASTER_DATA

    png_filename = f"{config.country_code_iso_3}_population.png"
    json_filename = f"{config.country_code_iso_3}_population_metadata.json"
    png_uri = _get_seed_repo_uri() + SEED_REPO_POPULATION_DATA_PNG_PATH + png_filename
    json_uri = _get_seed_repo_uri() + SEED_REPO_POPULATION_DATA_PNG_PATH + json_filename

    png_bytes = download_object(png_uri)
    if png_bytes is None:
        container.error = f"Failed to download PNG data from '{png_uri}'"
        raise ValueError(container.error)

    json_data = download_json_source(json_uri, check_count=False)
    if json_data is None:
        container.error = f"Failed to download metadata JSON from '{json_uri}'"
        raise ValueError(container.error)

    population_array = rgba_png_to_float_array(png_bytes)
    transform = Affine(*json_data["transform"][:6])
    crs = json_data["crs"]
    nodata = json_data["nodata"]

    container.data = RasterData(
        array=population_array.astype(np.float32),
        transform=transform,
        crs=crs,
        nodata=nodata,
    )


def _load_seed_repo_flood_extents(
    config: DataSourceConfig, container: LoadedDataSource
):
    container.data_type = DataType.FLOOD_EXTENT_PROVIDER

    country = config.country_code_iso_3
    base_url = _get_seed_repo_uri() + SEED_REPO_FLOOD_EXTENTS_RGBA_PATH
    manifest_url = f"{base_url}{country}_flood_extents_manifest.json"

    manifest = download_json_source(manifest_url, check_count=False)
    if manifest is None:
        container.error = (
            f"Failed to download flood extents manifest from '{manifest_url}'"
        )
        raise FileNotFoundError(container.error)

    container.data = FloodExtentProvider(
        available_return_periods=manifest["return_periods"],
        has_empty=manifest["has_empty"],
        _base_url=base_url,
        _country=country,
    )


# =============================================================================
# Flood source loaders
# =============================================================================


def _load_ibf_api_glofas_stations(
    container: LoadedDataSource,
    api_client: ApiClient,
    data_config: DataSourceConfig,
):
    container.data_type = DataType.LOCATION_POINT_DICT
    container.data = api_client.get_glofas_stations(
        data_config.country_code_iso_3,
    )


# TODO AB#42288: include as part of glofas stations api call
def _load_glofas_station_thresholds(
    config: DataSourceConfig, container: LoadedDataSource
) -> None:
    container.data_type = DataType.JSON_LIST
    country = config.country_code_iso_3
    url = f"{_get_seed_repo_uri()}/pipelines/{country}_station_thresholds.json"
    data = download_json_source(url, check_count=False)
    if data is None:
        container.error = f"Failed to download station thresholds from '{url}'"
        raise FileNotFoundError(container.error)
    seen: set[str] = set()
    thresholds: list[dict] = []
    for entry in data:
        station_code = entry["station_code"]
        if station_code not in seen:
            seen.add(station_code)
            thresholds.append(entry)
    container.data = thresholds


def _load_glofas_discharge(config: DataSourceConfig, container: LoadedDataSource):
    # TODO: Set the type correctly once real data is loaded
    container.data_type = DataType.UNSPECIFIED
    container.data = _load_dummy_data(config)
    if container.data is None:
        container.error = f"No dummy data found for source '{config.source}'"


# =============================================================================
# Drought source loaders
# =============================================================================


def _load_ecmwf_forecast(config: DataSourceConfig, container: LoadedDataSource):
    # TODO: Set the type correctly once real data is loaded
    container.data_type = DataType.UNSPECIFIED
    container.data = _load_dummy_data(config)
    if container.data is None:
        container.error = f"No dummy data found for source '{config.source}'"


# =============================================================================
# Helpers
# =============================================================================


def _load_dummy_data(source_config: DataSourceConfig) -> object:
    if source_config.source in DUMMY_DATA:
        return DUMMY_DATA[source_config.source]
    return None
