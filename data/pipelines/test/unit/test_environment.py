import os

import pytest

from pipelines.infra.environment import IbfEnvironment, load_environment_settings


class TestLoadEnvironmentSettings:
    def test_raises_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("IBF_ENVIRONMENT", raising=False)
        with pytest.raises(ValueError, match="IBF_ENVIRONMENT must be set"):
            load_environment_settings()

    def test_development(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("IBF_ENVIRONMENT", "development")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == IbfEnvironment.DEVELOPMENT
        assert not result.is_production

    def test_test(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("IBF_ENVIRONMENT", "test")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == IbfEnvironment.TEST
        assert not result.is_production

    def test_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("IBF_ENVIRONMENT", "production")
        result = load_environment_settings()
        assert result is not None
        assert result.environment == IbfEnvironment.PRODUCTION
        assert result.is_production

    def test_invalid_value_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("IBF_ENVIRONMENT", "staging")
        with pytest.raises(ValueError):
            load_environment_settings()
