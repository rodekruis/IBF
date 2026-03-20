from datetime import datetime, timezone
from pathlib import Path

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.models import (
    AdminAreaLayer,
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
)
from test.conftest import ALERT_ID


def test_incomplete_alert_is_rejected(valid_submitter: DataSubmitter, tmp_output: Path):
    submitter = DataSubmitter()
    submitter.create_alert(
        alert_id=ALERT_ID,
        hazard_types=[HazardType.FLOODS],
        centroid=Centroid(latitude=1.0, longitude=37.0),
        issued_at=datetime.now(timezone.utc),
        forecast_sources=[ForecastSource.GLOFAS],
    )

    errors = submitter.send_all(str(tmp_output))

    assert len(errors) > 0
    assert any("no time series data" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_timeseries_missing_median_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
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

    errors = submitter.send_all(str(tmp_output))

    assert any("expected 1 median record, found 0" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_timeseries_missing_ensemble_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
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
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
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

    errors = submitter.send_all(str(tmp_output))

    assert any("at least 1 ensemble-run record" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_admin_area_unequal_layer_counts_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    valid_submitter.add_admin_area_exposure(
        alert_id=ALERT_ID,
        place_code="PC001",
        layer=AdminAreaLayer.SPATIAL_EXTENT,
        value=True,
    )
    valid_submitter.add_admin_area_exposure(
        alert_id=ALERT_ID,
        place_code="PC002",
        layer=AdminAreaLayer.SPATIAL_EXTENT,
        value=True,
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("record count differs across layers" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_raster_missing_alert_extent_is_rejected(tmp_output: Path):
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
        layer=AdminAreaLayer.POPULATION_EXPOSED,
        value=0,
    )
    submitter.add_raster_exposure(
        alert_id=ALERT_ID,
        layer="some_other_layer",
        value="other.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(str(tmp_output))

    assert any("missing required 'alert_extent' layer" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_centroid_out_of_range_is_rejected(tmp_output: Path):
    submitter = DataSubmitter()
    submitter.create_alert(
        alert_id=ALERT_ID,
        hazard_types=[HazardType.FLOODS],
        centroid=Centroid(latitude=91.0, longitude=200.0),
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
        layer=AdminAreaLayer.POPULATION_EXPOSED,
        value=0,
    )
    submitter.add_raster_exposure(
        alert_id=ALERT_ID,
        layer="alert_extent",
        value="alert_extent.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(str(tmp_output))

    assert any("latitude 91.0 out of range" in e for e in errors)
    assert any("longitude 200.0 out of range" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_raster_invalid_extent_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    valid_submitter.add_raster_exposure(
        alert_id=ALERT_ID,
        layer="flood_depth",
        value="flood_depth.tif",
        extent={"xmin": 38.0, "ymin": 2.0, "xmax": 36.0, "ymax": 0.0},
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("invalid extent" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_lead_time_start_after_end_is_rejected(tmp_output: Path):
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
        lead_time_start="2026-03-21T00:00:00Z",
        lead_time_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )
    submitter.add_timeseries_data(
        alert_id=ALERT_ID,
        lead_time_start="2026-03-21T00:00:00Z",
        lead_time_end="2026-03-20T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
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

    errors = submitter.send_all(str(tmp_output))

    assert any("start must be before end" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_admin_area_missing_is_rejected(tmp_output: Path):
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
    submitter.add_raster_exposure(
        alert_id=ALERT_ID,
        layer="alert_extent",
        value="alert_extent.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(str(tmp_output))

    assert any("expected at least 1 record" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()
