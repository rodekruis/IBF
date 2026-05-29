from __future__ import annotations

from unittest.mock import patch

import pytest
from pipelines.infra.data_types.data_config_types import DataSource, DataSourceConfig
from pipelines.infra.data_types.enums import HazardType
from pipelines.infra.data_types.loaded_data_types import DataType, LoadedDataSource
from pipelines.infra.utils.data_provider_fetchers import _load_glofas_station_thresholds
from shared.country_data import CountryCodeIso3

# Fake base URL injected via GITHUB_DATA_BASE_URL; actual HTTP calls are mocked
MOCK_SEED_REPO_BASE_URL = "https://test-seed-repo"


def _make_config(country: CountryCodeIso3 = CountryCodeIso3.KEN) -> DataSourceConfig:
    return DataSourceConfig(
        country_code_iso_3=country,
        source=DataSource.GLOFAS_STATION_THRESHOLDS_SEED_REPO,
        hazard_type=HazardType.FLOODS,
    )


def _make_container() -> LoadedDataSource:
    return LoadedDataSource(
        data_type=DataType.UNSPECIFIED,
        data_source=DataSource.GLOFAS_STATION_THRESHOLDS_SEED_REPO,
    )


class TestLoadGlofasStationThresholds:
    def test_loads_and_deduplicates(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        raw_data = [
            {"station_code": "G1234", "thresholds": [{"rp": 2, "value": 100.0}]},
            {"station_code": "G1234", "thresholds": [{"rp": 2, "value": 100.0}]},
            {"station_code": "G5678", "thresholds": [{"rp": 5, "value": 200.0}]},
        ]
        config = _make_config(CountryCodeIso3.KEN)
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=raw_data,
        ):
            _load_glofas_station_thresholds(config, container)

        assert container.data_type == DataType.JSON_LIST
        assert isinstance(container.data, list)
        assert len(container.data) == 2
        assert container.data[0]["station_code"] == "G1234"
        assert container.data[1]["station_code"] == "G5678"

    def test_raises_when_download_fails(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        config = _make_config(CountryCodeIso3.KEN)
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=None,
        ):
            with pytest.raises(FileNotFoundError, match="Failed to download"):
                _load_glofas_station_thresholds(config, container)

        assert container.error is not None

    def test_constructs_correct_url(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        config = _make_config(CountryCodeIso3.ETH)
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=[{"station_code": "G1045", "thresholds": []}],
        ) as mock_download:
            _load_glofas_station_thresholds(config, container)

        mock_download.assert_called_once_with(
            f"{MOCK_SEED_REPO_BASE_URL}/pipelines/ETH_station_thresholds.json",
            check_count=False,
        )
