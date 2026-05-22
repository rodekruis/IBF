from unittest.mock import MagicMock

from shared.country_data import CountryCodeIso3

from pipelines.infra.data_types.alert_types import HazardType
from pipelines.infra.data_types.data_config_types import DataSource, DataSourceConfig
from pipelines.infra.data_types.loaded_data_types import DataType, LoadedDataSource
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.data_provider_fetchers import _load_ibf_api_glofas_stations


def _make_container() -> LoadedDataSource:
    return LoadedDataSource(
        data_type=DataType.UNSPECIFIED,
        data_source=DataSource.GLOFAS_STATIONS_IBF_API,
    )


def _make_stations() -> dict[str, LocationPoint]:
    return {
        "G5142": LocationPoint(name="Awash", lat=8.2, lon=37.5, id="G5142"),
        "G5200": LocationPoint(name="Borkena", lat=9.0, lon=38.1, id="G5200"),
    }


def test_parses_geo_features_into_location_points():
    api_client = MagicMock()
    api_client.get_glofas_stations.return_value = _make_stations()

    config = DataSourceConfig(
        country_code_iso_3=CountryCodeIso3.ETH,
        source=DataSource.GLOFAS_STATIONS_IBF_API,
        hazard_type=HazardType.FLOODS,
    )
    container = _make_container()

    _load_ibf_api_glofas_stations(container, api_client, config)

    assert container.data_type == DataType.LOCATION_POINT_DICT
    stations = container.data
    assert isinstance(stations, dict)
    assert len(stations) == 2

    assert "G5142" in stations
    awash = stations["G5142"]
    assert isinstance(awash, LocationPoint)
    assert awash.name == "Awash"
    assert awash.lat == 8.2
    assert awash.lon == 37.5
    assert awash.id == "G5142"

    assert "G5200" in stations
    borkena = stations["G5200"]
    assert borkena.name == "Borkena"
    assert borkena.lat == 9.0
    assert borkena.lon == 38.1


def test_handles_empty_stations():
    api_client = MagicMock()
    api_client.get_glofas_stations.return_value = {}

    config = DataSourceConfig(
        country_code_iso_3=CountryCodeIso3.ETH,
        source=DataSource.GLOFAS_STATIONS_IBF_API,
        hazard_type=HazardType.FLOODS,
    )
    container = _make_container()

    _load_ibf_api_glofas_stations(container, api_client, config)

    assert isinstance(container.data, dict)
    assert len(container.data) == 0
