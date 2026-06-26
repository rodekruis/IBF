import pytest
from shared.country_data import CountryCodeIso3

from pipelines.infra.data_types.data_config_types import CountryRunConfig
from pipelines.infra.run_forecasts import _resolve_countries


def _make_config(code: str) -> CountryRunConfig:
    return CountryRunConfig(
        country_code_iso_3=CountryCodeIso3(code),
        target_admin_level=3,
        data_sources=[],
    )


CONFIGS = {
    CountryCodeIso3.ETH: _make_config("ETH"),
    CountryCodeIso3.KEN: _make_config("KEN"),
    CountryCodeIso3.UGA: _make_config("UGA"),
}


class TestResolveCountries:
    def test_none_returns_all(self) -> None:
        result = _resolve_countries(CONFIGS, None)
        assert result == list(CONFIGS.values())

    def test_single_country(self) -> None:
        result = _resolve_countries(CONFIGS, ["KEN"])
        assert result == [CONFIGS[CountryCodeIso3.KEN]]

    def test_multiple_countries(self) -> None:
        result = _resolve_countries(CONFIGS, ["ETH", "UGA"])
        assert result == [CONFIGS[CountryCodeIso3.ETH], CONFIGS[CountryCodeIso3.UGA]]

    def test_case_insensitive(self) -> None:
        result = _resolve_countries(CONFIGS, ["ken"])
        assert result == [CONFIGS[CountryCodeIso3.KEN]]

    def test_unknown_country_returns_error(self) -> None:
        result = _resolve_countries(CONFIGS, ["MWI"])
        assert isinstance(result, str)
        assert "MWI" in result

    def test_empty_configs_returns_error(self) -> None:
        result = _resolve_countries({}, None)
        assert isinstance(result, str)
        assert "No countries configured" in result

    def test_mixed_valid_and_invalid_returns_error(self) -> None:
        result = _resolve_countries(CONFIGS, ["ETH", "MWI"])
        assert isinstance(result, str)
        assert "MWI" in result

    def test_invalid_iso3_raises(self) -> None:
        with pytest.raises(ValueError):
            _resolve_countries(CONFIGS, ["INVALID"])
