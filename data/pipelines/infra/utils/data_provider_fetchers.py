"""
Functions for fetching, loading, and parsing data.
When a new data source is added, this is the main file that needs to be updated.
See the readme for more details on adding new data sources.
"""

import csv
import io
import logging
import os

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
)
from pipelines.infra.data_types.loaded_data_types import (
    ClimateRegion,
    DataType,
    LoadedDataSource,
)
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.dummy_data import DUMMY_DATA
from shared.download_helpers import download_json_source, download_object

logger = logging.getLogger(__name__)

SEED_REPO_POPULATION_DATA_PNG_PATH = "/raster-data/population/data-png/"
SEED_REPO_ADMIN_AREAS_PATH = "/admin-areas/processed/"
# Note: this is getting glofas stations now. In the future, we most likely will be fetching
# climate areas, catchments or something like that.
# When we switch to that, the glofas station flow can be removed.
SEED_REPO_GLOFAS_STATIONS_PATH = "/country-data/glofas-loc/"


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
):

    match data_config.source:
        case DataSource.ADMIN_AREA_SEED_REPO:
            return _load_seed_repo_admin_areas(
                data_config, container, country_config.target_admin_level
            )
        case DataSource.POPULATION_SEED_REPO:
            return _load_seed_repo_population_data(data_config, container)
        case DataSource.GLOFAS_STATIONS_SEED_REPO:
            return _load_seed_repo_glofas_stations(data_config, container)
        case DataSource.CLIMATE_REGIONS_IBF_API:
            return _load_ibf_api_climate_regions(data_config, container)
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


def _load_seed_repo_admin_areas(
    config: DataSourceConfig, container: LoadedDataSource, target_admin_level: int
):
    # Example of the data being loaded:
    # https://github.com/rodekruis/IBF-seed-data/blob/main/admin-areas/processed/AGO_adm1.json

    container.data_type = DataType.ADMIN_AREA_SET

    filename = f"{config.country_code_iso_3}_adm{target_admin_level}.json"
    uri = _get_seed_repo_uri() + SEED_REPO_ADMIN_AREAS_PATH + filename

    geojson = download_json_source(uri, check_count=False)
    if geojson is None:
        container.error = f"Failed to download admin areas GeoJSON data from '{uri}'"
        raise ValueError(container.error)
    admin_areas = AdminAreasSet.from_geojson(target_admin_level, geojson)
    logger.info(
        f"Loaded {len(admin_areas.admin_areas)} features for admin level {target_admin_level}"
    )

    container.data = admin_areas


def _load_seed_repo_glofas_stations(
    config: DataSourceConfig, container: LoadedDataSource
):
    container.data_type = DataType.LOCATION_POINT_DICT

    # https://github.com/rodekruis/IBF-seed-data/blob/main/country-data/glofas-loc/glofas_stations_AGO.csv
    filename = f"glofas_stations_{config.country_code_iso_3}.csv"
    csv_uri = _get_seed_repo_uri() + SEED_REPO_GLOFAS_STATIONS_PATH + filename
    csv_data = download_object(csv_uri)
    if csv_data is None:
        container.error = (
            f"Failed to download Glofas stations CSV data from '{csv_uri}'"
        )
        raise ValueError(container.error)

    # Convert the CSV into a dict of location points keyed by id
    # Note: the data also has a station code, but this is the same value as the id
    reader = csv.DictReader(io.StringIO(csv_data.decode("utf-8")))
    stations: dict[str, LocationPoint] = {}
    for row in reader:
        station = LocationPoint(
            name=row["stationName"],
            lat=float(row["lat"]),
            lon=float(row["lon"]),
            id=row["fid"],
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


def _load_ibf_api_climate_regions(
    config: DataSourceConfig, container: LoadedDataSource
):
    container.data_type = DataType.CLIMATE_REGION_LIST
    raw = _load_dummy_data(config)
    if not isinstance(raw, list):
        container.error = f"No dummy data found for source '{config.source}'"
        return
    container.data = [ClimateRegion.from_raw(item) for item in raw]


def _load_dummy_data(source_config: DataSourceConfig) -> object:
    if source_config.source in DUMMY_DATA:
        return DUMMY_DATA[source_config.source]
    return None
