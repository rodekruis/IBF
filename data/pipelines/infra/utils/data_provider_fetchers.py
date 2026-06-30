"""
Functions for fetching, loading, and parsing data.
When a new data source is added, this is the main file that needs to be updated.
See the readme for more details on adding new data sources.
"""

import logging
import os

import numpy as np
from pipelines.constants import DEFAULT_CRS, POPULATION_NODATA_VALUE
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
)
from pipelines.infra.data_types.enums import LayerName
from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.glofas_discharge_provider import (
    download_glofas_discharge_from_ftp,
    download_glofas_discharge_from_seed_repo,
)
from pipelines.infra.data_types.loaded_data_types import (
    DataType,
    LoadedDataSource,
    RasterData,
)
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.dummy_data import DUMMY_DATA
from rasterio.transform import Affine
from shared.download_helpers import download_json_source
from shared.image_helpers import rgba_png_to_float_array

logger = logging.getLogger(__name__)

SEED_REPO_FLOOD_EXTENTS_DATA_PNG_PATH = "/raster-data/flood-extents/data-png/"


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
        case DataSource.POPULATION_IBF_API:
            return _load_ibf_api_population_data(data_config, container, api_client)
        case DataSource.FLOOD_EXTENTS_SEED_REPO:
            return _load_seed_repo_flood_extents(data_config, container)

        # --- Flood sources ---
        case DataSource.GLOFAS_STATIONS_IBF_API:
            return _load_ibf_api_glofas_stations(
                container,
                api_client,
                data_config,
            )
        case DataSource.GLOFAS_DISCHARGE_FTP:
            return _load_glofas_discharge_ftp(data_config, container)
        case DataSource.GLOFAS_DISCHARGE_SEED_REPO_ALERT:
            return _load_glofas_discharge_seed_repo(data_config, container, "alert")
        case DataSource.GLOFAS_DISCHARGE_SEED_REPO_NO_ALERT:
            return _load_glofas_discharge_seed_repo(data_config, container, "no-alert")

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
    admin_areas_set = AdminAreasSet.from_api(data)
    _validate_parent_pcodes(admin_areas_set, country_code_iso_3)
    container.data = admin_areas_set


def _validate_parent_pcodes(
    admin_areas_set: AdminAreasSet, country_code_iso_3: str
) -> None:
    """
    Every admin area at level N (N > 1) must have parent place codes for all
    levels 1..N-1. Missing parents indicate broken data and would silently
    break downstream aggregation.
    """
    missing: list[str] = []
    for pcode, area in admin_areas_set.admin_areas.items():
        level = area.properties.admin_level
        for parent_level in range(1, level):
            if not area.properties.parent_pcodes.get(parent_level):
                missing.append(
                    f"{pcode} (level {level}) missing placeCodeLevel{parent_level}"
                )
    if missing:
        preview = ", ".join(missing[:5])
        suffix = f" (and {len(missing) - 5} more)" if len(missing) > 5 else ""
        raise ValueError(
            f"Admin areas for {country_code_iso_3} have missing parent place codes: {preview}{suffix}"
        )


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


def _load_ibf_api_population_data(
    config: DataSourceConfig, container: LoadedDataSource, api_client: ApiClient
):
    container.data_type = DataType.RASTER_DATA

    layer_name = LayerName.POPULATION
    raster_info = api_client.get_static_raster_metadata(
        config.country_code_iso_3, layer_name
    )
    if raster_info is None:
        container.error = f"Failed to download population raster metadata from API for {config.country_code_iso_3}"
        raise ValueError(container.error)

    png_bytes = api_client.get_static_raster_data_image(
        config.country_code_iso_3, layer_name
    )
    if png_bytes is None:
        container.error = f"Failed to download population raster data from API for {config.country_code_iso_3}"
        raise ValueError(container.error)

    population_array = rgba_png_to_float_array(png_bytes)
    extent = raster_info["extent"]
    width = population_array.shape[1]
    height = population_array.shape[0]
    x_res = (extent["xmax"] - extent["xmin"]) / width
    y_res = (extent["ymax"] - extent["ymin"]) / height
    transform = Affine(x_res, 0, extent["xmin"], 0, -y_res, extent["ymax"])

    container.data = RasterData(
        array=population_array.astype(np.float32),
        transform=transform,
        crs=DEFAULT_CRS,
        nodata=POPULATION_NODATA_VALUE,
    )


def _load_seed_repo_flood_extents(
    config: DataSourceConfig, container: LoadedDataSource
):
    container.data_type = DataType.FLOOD_EXTENT_PROVIDER

    country = config.country_code_iso_3
    base_url = _get_seed_repo_uri() + SEED_REPO_FLOOD_EXTENTS_DATA_PNG_PATH
    manifest_url = f"{base_url}{country}_flood_extents_manifest.json"

    manifest = download_json_source(manifest_url, check_count=False)
    if manifest is None:
        container.error = (
            f"Failed to download flood extents manifest from '{manifest_url}'"
        )
        raise FileNotFoundError(container.error)

    container.data = FloodExtentProvider(
        available_return_periods=manifest["return_periods"],
        base_url=base_url,
        country=country,
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
    stations = api_client.get_glofas_stations(
        data_config.country_code_iso_3,
    )
    _validate_station_thresholds(stations, data_config.country_code_iso_3)
    container.data = stations


def _validate_station_thresholds(
    stations: dict[str, LocationPoint], country_code_iso_3: str
) -> None:
    missing = [
        station_id
        for station_id, station in stations.items()
        if not station.attributes.get("thresholds")
    ]
    if missing:
        raise ValueError(
            f"GloFAS stations for {country_code_iso_3} missing thresholds: {', '.join(missing)}"
        )


def _load_glofas_discharge_ftp(
    config: DataSourceConfig, container: LoadedDataSource
) -> None:
    container.data_type = DataType.PATH_LIST
    container.data = download_glofas_discharge_from_ftp(config.country_code_iso_3)


def _load_glofas_discharge_seed_repo(
    config: DataSourceConfig, container: LoadedDataSource, variant: str
) -> None:
    container.data_type = DataType.PATH_LIST
    container.data = download_glofas_discharge_from_seed_repo(
        config.country_code_iso_3, variant
    )


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
