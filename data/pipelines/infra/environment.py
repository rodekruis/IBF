from __future__ import annotations

import os
from dataclasses import dataclass
from enum import StrEnum


class NrwEnvironment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


@dataclass(frozen=True)
class EnvironmentSettings:
    environment: NrwEnvironment

    @property
    def is_production(self) -> bool:
        return self.environment == NrwEnvironment.PRODUCTION

    @property
    def is_development(self) -> bool:
        return self.environment == NrwEnvironment.DEVELOPMENT


def load_environment_settings() -> EnvironmentSettings:
    raw = os.environ.get("NRW_ENVIRONMENT")
    if not raw:
        raise ValueError(
            "NRW_ENVIRONMENT must be set to 'development', 'test', 'staging' or 'production'"
        )

    try:
        environment = NrwEnvironment(raw)
    except ValueError as exc:
        raise ValueError(
            f"NRW_ENVIRONMENT must be 'development', 'test', 'staging' or 'production' (got {raw!r})"
        ) from exc

    return EnvironmentSettings(environment=environment)
