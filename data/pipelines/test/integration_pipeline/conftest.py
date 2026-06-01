"""Shared pytest fixtures for full-pipeline integration tests.

Unlike integration_infra tests (which use --scenario to bypass forecast.py),
these tests run the actual hazard-specific forecast logic end-to-end.
They verify that forecast.py produces output the API accepts.
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
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
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

    return subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
    )


@dataclass(frozen=True)
class PipelineRunner:
    run_pipeline: Callable[..., subprocess.CompletedProcess[str]]


@pytest.fixture()
def pipeline() -> PipelineRunner:
    return PipelineRunner(run_pipeline=_run_pipeline)
