from shared.country_data import CountryCodeIso3

from pipelines.infra.data_types.data_config_types import DataSource, DataSourceConfig
from pipelines.infra.data_types.enums import ForecastSource, HazardType
from pipelines.infra.run_forecasts import _get_forecast_sources


def _make_source_config(source: DataSource) -> DataSourceConfig:
    return DataSourceConfig(
        country_code_iso_3=CountryCodeIso3.ETH,
        source=source,
        hazard_type=HazardType.FLOODS,
    )


class TestGetForecastSources:
    def test_maps_forecast_inputs_and_skips_other_data_sources(self) -> None:
        # Arrange
        source_configs = [
            _make_source_config(DataSource.ALERT_CONFIGS_IBF_API),
            _make_source_config(DataSource.ADMIN_AREA_IBF_API),
            _make_source_config(DataSource.POPULATION_IBF_API),
            _make_source_config(DataSource.FLOOD_DEPTH_SEED_REPO),
            _make_source_config(DataSource.GLOFAS_DISCHARGE_FTP),
        ]

        # Act
        result = _get_forecast_sources(source_configs)

        # Assert
        assert result == [
            ForecastSource.WORLDPOP,
            ForecastSource.GLOFAS_FLOOD_HAZARD_MAPS,
            ForecastSource.GLOFAS_RIVER_DISCHARGE,
        ]

    def test_deduplicates_data_sources_of_the_same_forecast_source(self) -> None:
        # Arrange
        source_configs = [
            _make_source_config(DataSource.GEFS_WIND_SEED_REPO_ALERT),
            _make_source_config(DataSource.GEFS_TRACK_SEED_REPO_ALERT),
        ]

        # Act
        result = _get_forecast_sources(source_configs)

        # Assert
        assert result == [ForecastSource.GEFS_TROPICAL_CYCLONE]
