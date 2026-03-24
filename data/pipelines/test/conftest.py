from datetime import datetime, timezone
from pathlib import Path

import pytest
from pipelines.infra.alert_types import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)
from pipelines.infra.data_submitter import DataSubmitter

ALERT_NAME = "TST_floods_station-test"


def _create_valid_submitter() -> DataSubmitter:
    """Build a DataSubmitter with one fully valid alert (severity, admin areas,
    rasters) so tests can add a single defect on top and verify it is caught."""
    submitter = DataSubmitter()
    submitter.create_alert(
        alert_name=ALERT_NAME,
        hazard_types=[HazardType.FLOODS],
        centroid=Centroid(latitude=1.0, longitude=37.0),
        issued_at=datetime.now(timezone.utc),
        forecast_sources=[ForecastSource.GLOFAS],
    )
    submitter.add_severity_data(
        alert_name=ALERT_NAME,
        lead_time_start="2026-03-20T00:00:00Z",
        lead_time_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_severity_data(
        alert_name=ALERT_NAME,
        lead_time_start="2026-03-20T00:00:00Z",
        lead_time_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_admin_area_exposure(
        alert_name=ALERT_NAME,
        place_code="PC001",
        admin_level=3,
        layer=Layer.SPATIAL_EXTENT,
        value=True,
    )
    submitter.add_admin_area_exposure(
        alert_name=ALERT_NAME,
        place_code="PC001",
        admin_level=3,
        layer=Layer.POPULATION_EXPOSED,
        value=0,
    )
    submitter.add_raster_exposure(
        alert_name=ALERT_NAME,
        layer="alert_extent",
        value="alert_extent.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )
    return submitter


@pytest.fixture()
def valid_submitter() -> DataSubmitter:
    return _create_valid_submitter()


@pytest.fixture()
def tmp_output(tmp_path: Path) -> Path:
    return tmp_path / "output"
