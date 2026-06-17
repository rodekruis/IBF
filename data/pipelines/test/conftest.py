import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from unittest.mock import MagicMock

import pytest

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.dtos import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
    SeverityKey,
)
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.raster import PLACEHOLDER_RASTER_BASE64

EVENT_NAME = "ETH_floods_station-test"


def _create_valid_submitter(mock_api_client: MagicMock) -> DataSubmitter:
    """Build a DataSubmitter with one fully valid alert (severity, admin areas,
    rasters) so tests can add a single defect on top and verify it is caught."""
    submitter = DataSubmitter(mock_api_client)
    submitter.set_forecast_metadata(
        issued_at=datetime.now(timezone.utc),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
    )
    submitter.create_alert(
        event_name=EVENT_NAME,
        centroid=Centroid(latitude=1.0, longitude=37.0),
    )
    submitter.add_severity_data(
        event_name=EVENT_NAME,
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key=SeverityKey.RETURN_PERIOD,
        severity_value=0,
    )
    submitter.add_severity_data(
        event_name=EVENT_NAME,
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key=SeverityKey.RETURN_PERIOD,
        severity_value=0,
    )
    submitter.add_admin_area_exposure(
        event_name=EVENT_NAME,
        admin_level=3,
        layer=Layer.POPULATION_EXPOSED,
        values_by_place_code={"PC001": 0},
    )
    submitter.add_raster_exposure(
        event_name=EVENT_NAME,
        layer=Layer.ALERT_EXTENT,
        value_black_white=PLACEHOLDER_RASTER_BASE64,
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )
    return submitter


@pytest.fixture()
def mock_api_client() -> MagicMock:
    return MagicMock(spec=ApiClient)


@pytest.fixture()
def valid_submitter(mock_api_client: MagicMock) -> DataSubmitter:
    return _create_valid_submitter(mock_api_client)


@pytest.fixture()
def tmp_output(tmp_path: Path) -> Path:
    return tmp_path / "output"


def _run_pipeline(
    config: str,
    mock: int | None = None,
    infra_only: bool = False,
    issued_at: str | None = None,
    country: str | None = None,
) -> subprocess.CompletedProcess[str]:
    cmd = [
        sys.executable,
        "-m",
        "pipelines.infra.run_forecasts",
        "--config",
        config,
    ]
    if mock is not None:
        cmd.extend(["--mock", str(mock)])
    if infra_only:
        cmd.append("--infra-only")
    if issued_at:
        cmd.extend(["--issued-at", issued_at])
    if country:
        cmd.extend(["--country", country])

    return subprocess.run(
        cmd,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )


@dataclass(frozen=True)
class PipelineRunner:
    run_pipeline: Callable[..., subprocess.CompletedProcess[str]]


@pytest.fixture()
def pipeline() -> PipelineRunner:
    return PipelineRunner(run_pipeline=_run_pipeline)
