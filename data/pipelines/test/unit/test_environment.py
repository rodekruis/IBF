import pytest

from pipelines.infra.environment import load_environment_settings, NrwEnvironment


class TestLoadEnvironmentSettings:
    def test_raises_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("NRW_ENVIRONMENT", raising=False)
        with pytest.raises(ValueError, match="NRW_ENVIRONMENT must be set"):
            load_environment_settings()

    def test_raises_when_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NRW_ENVIRONMENT", "")
        with pytest.raises(ValueError, match="NRW_ENVIRONMENT must be set"):
            load_environment_settings()

    def test_development(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NRW_ENVIRONMENT", "development")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == NrwEnvironment.DEVELOPMENT
        assert not result.is_production

    def test_test(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NRW_ENVIRONMENT", "test")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == NrwEnvironment.TEST
        assert not result.is_production

    def test_staging(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NRW_ENVIRONMENT", "staging")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == NrwEnvironment.STAGING
        assert not result.is_production

    def test_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NRW_ENVIRONMENT", "production")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == NrwEnvironment.PRODUCTION
        assert result.is_production

    def test_invalid_value_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NRW_ENVIRONMENT", "prod")
        with pytest.raises(ValueError, match="got 'prod'"):
            load_environment_settings()
