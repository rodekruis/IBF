import csv
import io

from pipelines.infra.config_reader import DataSource, DataSourceConfig
from pipelines.infra.data_source_container import DataSourceContainer
from pipelines.infra.infra_utils.dummy_data import DUMMY_DATA
from shared.download_helpers import download_json_source, download_object

SEED_REPO_URI = "https://github.com/rodekruis/IBF-seed-data/tree/main/"
SEED_REPO_POPULATION_GREYSCALE_PATH = "raster-data/population/greyscale/"
SEED_REPO_ADMIN_BOUNDARIES_PATH = "admin-areas/processed/"
SEED_REPO_GLOFAS_STATIONS_PATH = "country-data/glofas-loc/"


def load_data_container(config: DataSourceConfig, container: DataSourceContainer):

    match config.source:
        case DataSource.SEED_DATA_REPO_ADMIN:
            return _load_seed_repo_admin_boundaries(config, container)
        case DataSource.SEED_DATA_REPO_POPULATION:
            return _load_seed_repo_population_data(config, container)
        case DataSource.SEED_DATA_REPO_GLOFAS_STATIONS:
            return _load_seed_repo_glofas_stations(config, container)
        case DataSource.IBF_API_CLIMATE_REGIONS:
            return _load_ibf_api_climate_regions(config, container)
        case DataSource.TODO_DATA_SOURCE:
            container.error = "Data source not yet configured"
            raise NotImplementedError("Data source not yet configured")
        case _:
            container.error = f"Unknown source type: '{config.source}'"
            raise ValueError(f"Unknown source type: '{config.source}'")


def _load_ibf_api_climate_regions(
    config: DataSourceConfig, container: DataSourceContainer
):
    container.data = _load_dummy_data(config)
    if container.data is None:
        container.error = f"No dummy data found for source '{config.name}'"


def _load_seed_repo_admin_boundaries(
    config: DataSourceConfig, container: DataSourceContainer
):
    # https://github.com/rodekruis/IBF-seed-data/blob/main/admin-areas/processed/AGO_adm3.json
    print("todo:")


def _load_seed_repo_glofas_stations(
    config: DataSourceConfig, container: DataSourceContainer
):
    # https://github.com/rodekruis/IBF-seed-data/blob/main/country-data/glofas-loc/glofas_stations_AGO.csv
    filename = f"glofas_stations_{config.iso_3_code}.csv"
    csv_uri = SEED_REPO_URI + SEED_REPO_GLOFAS_STATIONS_PATH + filename
    csv_data = download_object(csv_uri)
    if csv_data is None:
        container.error = (
            f"Failed to download Glofas stations CSV data from '{csv_uri}'"
        )
        raise ValueError(container.error)

    # Convert the CSV into a dict keyed by stationCode
    reader = csv.DictReader(io.StringIO(csv_data.decode("utf-8")))
    stations = {}
    for row in reader:
        stations[row["stationCode"]] = {
            "stationName": row["stationName"],
            "lat": float(row["lat"]),
            "lon": float(row["lon"]),
            "fid": row["fid"],
        }
    container.data = stations


def _load_seed_repo_population_data(
    config: DataSourceConfig, container: DataSourceContainer
):

    png_filename = f"{config.iso_3_code}_population.png"
    json_filename = f"{config.iso_3_code}_population_metadata.json"
    png_uri = SEED_REPO_URI + SEED_REPO_POPULATION_GREYSCALE_PATH + png_filename
    json_uri = SEED_REPO_URI + SEED_REPO_POPULATION_GREYSCALE_PATH + json_filename

    container.data = download_object(png_uri)
    if container.data is None:
        container.error = f"Failed to download PNG data from '{png_uri}'"
        raise ValueError(container.error)

    json_data = download_json_source(json_filename, json_uri, check_count=False)
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


def _load_dummy_data(source_config: DataSourceConfig) -> object:
    if source_config.name in DUMMY_DATA:
        return DUMMY_DATA[source_config.name]
    return None
