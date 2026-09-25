from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from shared.country_data import CountryCodeIso3

from pipelines.infra import run_forecasts as run_forecasts_module
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
    OutputMode,
)
from pipelines.infra.data_types.enums import HazardType
from pipelines.infra.run_forecasts import (
    _has_retryable_source_failure,
    _retry_failed_data_countries,
    _run_country,
    CountryRunResult,
    ForecastRunContext,
)


def _make_country(
    code: str, data_sources: list[DataSourceConfig] | None = None
) -> CountryRunConfig:
    return CountryRunConfig(
        country_code_iso_3=CountryCodeIso3(code),
        target_admin_level=3,
        data_sources=data_sources or [],
    )


def _make_source(code: str, source: DataSource, retryable: bool) -> DataSourceConfig:
    return DataSourceConfig(
        country_code_iso_3=CountryCodeIso3(code),
        source=source,
        hazard_type=HazardType.FLOODS,
        retryable=retryable,
    )


def _make_context() -> ForecastRunContext:
    return ForecastRunContext(
        hazard_fn=lambda *args: None,
        hazard_type=HazardType.FLOODS,
        issued_at=None,
        output_mode=OutputMode.API,
        output_path="output",
        api_client=MagicMock(),
        local_data=None,
        local_data_date=None,
    )


class TestRetryFailedDataCountries:
    def test_data_failure_is_retried_after_a_success(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Arrange
        failed_country = _make_country("KEN")
        succeeded_country = _make_country("ETH")
        results = [
            CountryRunResult(
                failed_country, ["FTP timeout"], is_retryable_data_failure=True
            ),
            CountryRunResult(succeeded_country, [], is_retryable_data_failure=False),
        ]

        def fake_run_country(
            _context: ForecastRunContext, country: CountryRunConfig
        ) -> CountryRunResult:
            return CountryRunResult(country, [], is_retryable_data_failure=False)

        monkeypatch.setattr(run_forecasts_module, "_run_country", fake_run_country)

        # Act
        retried = _retry_failed_data_countries(_make_context(), results)

        # Assert
        assert all(not result.errors for result in retried)

    def test_no_retry_when_no_country_succeeds(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Arrange
        results = [
            CountryRunResult(
                _make_country("KEN"), ["FTP timeout"], is_retryable_data_failure=True
            ),
            CountryRunResult(
                _make_country("ETH"), ["FTP timeout"], is_retryable_data_failure=True
            ),
        ]
        retried_countries: list[CountryRunConfig] = []

        def fake_run_country(
            _context: ForecastRunContext, country: CountryRunConfig
        ) -> CountryRunResult:
            retried_countries.append(country)
            return CountryRunResult(country, [], is_retryable_data_failure=False)

        monkeypatch.setattr(run_forecasts_module, "_run_country", fake_run_country)

        # Act
        retried = _retry_failed_data_countries(_make_context(), results)

        # Assert
        assert retried is results
        assert retried_countries == []
        assert all(result.errors for result in retried)

    def test_non_retryable_failure_is_not_retried(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Arrange
        succeeded_country = _make_country("KEN")
        failed_country = _make_country("ETH")
        results = [
            CountryRunResult(succeeded_country, [], is_retryable_data_failure=False),
            CountryRunResult(
                failed_country, ["submission failed"], is_retryable_data_failure=False
            ),
        ]
        retried_countries: list[CountryRunConfig] = []

        def fake_run_country(
            _context: ForecastRunContext, country: CountryRunConfig
        ) -> CountryRunResult:
            retried_countries.append(country)
            return CountryRunResult(country, [], is_retryable_data_failure=False)

        monkeypatch.setattr(run_forecasts_module, "_run_country", fake_run_country)

        # Act
        retried = _retry_failed_data_countries(_make_context(), results)

        # Assert
        assert retried_countries == []
        failed_result = next(
            result for result in retried if result.country is failed_country
        )
        assert failed_result.errors == ["submission failed"]

    def test_retry_result_replaces_original_outcome(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Arrange
        failed_country = _make_country("KEN")
        succeeded_country = _make_country("ETH")
        results = [
            CountryRunResult(
                failed_country, ["FTP timeout"], is_retryable_data_failure=True
            ),
            CountryRunResult(succeeded_country, [], is_retryable_data_failure=False),
        ]

        def fake_run_country(
            _context: ForecastRunContext, country: CountryRunConfig
        ) -> CountryRunResult:
            return CountryRunResult(
                country, ["still failing"], is_retryable_data_failure=True
            )

        monkeypatch.setattr(run_forecasts_module, "_run_country", fake_run_country)

        # Act
        retried = _retry_failed_data_countries(_make_context(), results)

        # Assert
        failed_result = next(
            result for result in retried if result.country is failed_country
        )
        succeeded_result = next(
            result for result in retried if result.country is succeeded_country
        )
        assert failed_result.errors == ["still failing"]
        assert succeeded_result.errors == []


class _FakeDataProvider:
    def __init__(self, loaded_data: dict[DataSource, object]) -> None:
        self.loaded_data = loaded_data

    def try_load_data(self, _country: CountryRunConfig) -> tuple[bool, list[str]]:
        return False, ["load failed"]


class TestRunCountryRetryableFlag:
    def test_retryable_source_failure_is_flagged(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Arrange
        country = _make_country(
            "KEN",
            [_make_source("KEN", DataSource.GLOFAS_DISCHARGE_FTP, retryable=True)],
        )
        loaded_data: dict[DataSource, object] = {
            DataSource.GLOFAS_DISCHARGE_FTP: SimpleNamespace(error="timeout"),
        }
        monkeypatch.setattr(
            run_forecasts_module,
            "DataProvider",
            lambda *args, **kwargs: _FakeDataProvider(loaded_data),
        )

        # Act
        result = _run_country(_make_context(), country)

        # Assert
        assert result.is_retryable_data_failure is True

    def test_non_retryable_source_failure_is_not_flagged(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Arrange
        country = _make_country(
            "KEN",
            [_make_source("KEN", DataSource.POPULATION_IBF_API, retryable=False)],
        )
        loaded_data: dict[DataSource, object] = {
            DataSource.POPULATION_IBF_API: SimpleNamespace(error="not found"),
        }
        monkeypatch.setattr(
            run_forecasts_module,
            "DataProvider",
            lambda *args, **kwargs: _FakeDataProvider(loaded_data),
        )

        # Act
        result = _run_country(_make_context(), country)

        # Assert
        assert result.is_retryable_data_failure is False


class TestHasRetryableSourceFailure:
    def test_false_when_the_failed_source_is_not_retryable(self) -> None:
        # Arrange
        country = _make_country(
            "KEN",
            [
                _make_source("KEN", DataSource.GLOFAS_DISCHARGE_FTP, retryable=True),
                _make_source("KEN", DataSource.POPULATION_IBF_API, retryable=False),
            ],
        )
        data_provider = _FakeDataProvider(
            {
                DataSource.GLOFAS_DISCHARGE_FTP: SimpleNamespace(error=None),
                DataSource.POPULATION_IBF_API: SimpleNamespace(error="not found"),
            }
        )

        # Act
        result = _has_retryable_source_failure(country, data_provider)  # type: ignore[arg-type]

        # Assert
        assert result is False
