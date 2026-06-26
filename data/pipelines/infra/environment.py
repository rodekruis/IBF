from __future__ import annotations

import os
from dataclasses import dataclass
from enum import StrEnum


class IbfEnvironment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


@dataclass(frozen=True)
class EnvironmentSettings:
    environment: IbfEnvironment

    @property
    def is_production(self) -> bool:
        return self.environment == IbfEnvironment.PRODUCTION


def load_environment_settings() -> EnvironmentSettings:
    raw = os.environ.get("IBF_ENVIRONMENT")
    if raw is None:
        raise ValueError(
            "IBF_ENVIRONMENT must be set to 'development', 'test' or 'production'"
        )
    return EnvironmentSettings(environment=IbfEnvironment(raw))
