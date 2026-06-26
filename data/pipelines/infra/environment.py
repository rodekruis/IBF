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
    if not raw:
        raise ValueError(
            "IBF_ENVIRONMENT must be set to 'development', 'test' or 'production'"
        )

    try:
        environment = IbfEnvironment(raw)
    except ValueError as exc:
        raise ValueError(
            f"IBF_ENVIRONMENT must be 'development', 'test' or 'production' (got {raw!r})"
        ) from exc

    return EnvironmentSettings(environment=environment)
