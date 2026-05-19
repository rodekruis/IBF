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


def _make_api_response() -> list[dict]:
    return [
        {
            "referenceId": "G5142",
            "geometry": {"type": "Point", "coordinates": [37.5, 8.2]},
            "attributes": {"name": "Awash"},
        },
        {
            "referenceId": "G5200",
            "geometry": {"type": "Point", "coordinates": [38.1, 9.0]},
            "attributes": {"name": "Borkena"},
        },
    ]


def test_parses_geo_features_into_location_points():
    api_client = MagicMock()
    api_client.get_geo_features.return_value = _make_api_response()

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


def test_handles_missing_attributes_name():
    api_client = MagicMock()
    api_client.get_geo_features.return_value = [
        {
            "referenceId": "G9999",
            "geometry": {"type": "Point", "coordinates": [36.0, 7.0]},
            "attributes": {},
        },
    ]

    config = DataSourceConfig(
        country_code_iso_3=CountryCodeIso3.ETH,
        source=DataSource.GLOFAS_STATIONS_IBF_API,
        hazard_type=HazardType.FLOODS,
    )
    container = _make_container()

    _load_ibf_api_glofas_stations(container, api_client, config)

    assert isinstance(container.data, dict)
    station = container.data["G9999"]
    assert station.name == ""
    assert station.id == "G9999"
