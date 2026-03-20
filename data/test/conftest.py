from datetime import datetime, timezone
from pathlib import Path

import pytest
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.models import (
    AdminAreaLayer,
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
)

ALERT_ID = "TST_floods_station-test"


def _create_valid_submitter() -> DataSubmitter:
    submitter = DataSubmitter()
    submitter.create_alert(
        alert_id=ALERT_ID,
        hazard_types=[HazardType.FLOODS],
        centroid=Centroid(latitude=1.0, longitude=37.0),
        issued_at=datetime.now(timezone.utc),
        forecast_sources=[ForecastSource.GLOFAS],
    )
    submitter.add_timeseries_data(
        alert_id=ALERT_ID,
        lead_time_start="2026-03-20T00:00:00Z",
        lead_time_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_timeseries_data(
        alert_id=ALERT_ID,
        lead_time_start="2026-03-20T00:00:00Z",
        lead_time_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_admin_area_exposure(
        alert_id=ALERT_ID,
        place_code="PC001",
        layer=AdminAreaLayer.SPATIAL_EXTENT,
        value=True,
    )
    submitter.add_admin_area_exposure(
        alert_id=ALERT_ID,
        place_code="PC001",
        layer=AdminAreaLayer.POPULATION_EXPOSED,
        value=0,
    )
    submitter.add_raster_exposure(
        alert_id=ALERT_ID,
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
