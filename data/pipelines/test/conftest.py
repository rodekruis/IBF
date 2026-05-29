from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.dtos import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)
from pipelines.infra.utils.api_client import ApiClient

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
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_severity_data(
        event_name=EVENT_NAME,
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_admin_area_exposure(
        event_name=EVENT_NAME,
        place_code="PC001",
        admin_level=3,
        layer=Layer.POPULATION_EXPOSED,
        value=0,
    )
    submitter.add_raster_exposure(
        event_name=EVENT_NAME,
        layer=Layer.ALERT_EXTENT,
        value="alert_extent.tif",
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
