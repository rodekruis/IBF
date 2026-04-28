"""Shared pytest fixtures for pipeline-infra API integration tests.

These tests use the --scenario flag to bypass forecast.py and submit the
resulting forecast to a live API, exercising the pipeline infrastructure
end-to-end including API submission.
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
    scenario: str | None = None,
    issued_at: str | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    # For integration API tests, we want to ensure the pipeline submits to the API
    env["IBF_OUTPUT_MODE"] = OutputMode.API
    if extra_env:
        env.update(extra_env)

    cmd = [
        sys.executable,
        "-m",
        "pipelines.infra.run_forecasts",
        "--config",
        config,
        "--run-target",
        run_target,
    ]
    if scenario:
        cmd.extend(["--scenario", scenario])
    if issued_at:
        cmd.extend(["--issued-at", issued_at])

    return subprocess.run(
        cmd,
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
