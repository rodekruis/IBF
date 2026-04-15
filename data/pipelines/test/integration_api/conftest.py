"""Shared pytest fixtures for integration API tests.

Provides helpers to run pipeline subprocesses against a live API,
so individual test modules don't have to duplicate the boilerplate.
"""

import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Callable

import pytest
from pipelines.infra.data_types.data_config_types import OutputMode


def _run_pipeline(
    config: str,
    run_target: str,
    extra_env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    # For integration API tests, we want to ensure the pipeline submits to the API
    env["IBF_OUTPUT_MODE"] = OutputMode.API
    if extra_env:
        env.update(extra_env)

    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pipelines.infra.run_forecasts",
            "--config",
            config,
            "--run-target",
            run_target,
        ],
        env=env,
        capture_output=True,
        text=True,
    )


@dataclass(frozen=True)
class PipelineHelpers:
    run_pipeline: Callable[..., subprocess.CompletedProcess[str]]


@pytest.fixture()
def pipeline() -> PipelineHelpers:
    return PipelineHelpers(
        run_pipeline=_run_pipeline,
    )
