from datetime import datetime, timezone
from pathlib import Path

from pipelines.infra.alert_types import (
    AdminAreaLayer,
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
)
from pipelines.infra.data_submitter import DataSubmitter

ALERT_ID = "TST_floods_station-test"


def test_incomplete_alert_is_rejected(tmp_output: Path):
    """An alert with only metadata and no timeseries/exposure data is rejected."""
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
    """A lead time with ensemble runs but no median record is rejected."""
    valid_submitter.add_timeseries_data(
        alert_id=ALERT_ID,
        lead_time_start="2026-03-21T00:00:00Z",
        lead_time_end="2026-03-21T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("expected 1 median record, found 0" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_timeseries_missing_ensemble_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A lead time with a median but no ensemble runs is rejected."""
    valid_submitter.add_timeseries_data(
        alert_id=ALERT_ID,
        lead_time_start="2026-03-21T00:00:00Z",
        lead_time_end="2026-03-21T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("at least 1 ensemble-run record" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_admin_area_unequal_layer_counts_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """Admin-area data with different numbers of place codes per layer are rejected."""
    valid_submitter.add_admin_area_exposure(
        alert_id=ALERT_ID,
        place_code="PC001",
        admin_level=3,
        layer=AdminAreaLayer.SPATIAL_EXTENT,
        value=True,
    )
    valid_submitter.add_admin_area_exposure(
        alert_id=ALERT_ID,
        place_code="PC002",
        admin_level=3,
        layer=AdminAreaLayer.SPATIAL_EXTENT,
        value=True,
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("record count differs across layers" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_raster_missing_alert_extent_is_rejected(tmp_output: Path):
    """Raster exposure without the required 'alert_extent' layer is rejected."""
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
        admin_level=3,
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
    """A centroid with latitude or longitude outside valid WGS84 bounds is rejected."""
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
        admin_level=3,
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
    """A raster whose xmin >= xmax or ymin >= ymax is rejected."""
    valid_submitter.add_raster_exposure(
        alert_id=ALERT_ID,
        layer="flood_depth",
        value="flood_depth.tif",
        extent={"xmin": 38.0, "ymin": 2.0, "xmax": 36.0, "ymax": 0.0},
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("invalid extent" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_lead_time_start_after_end_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A lead time whose start timestamp is after its end timestamp is rejected."""
    valid_submitter.add_timeseries_data(
        alert_id=ALERT_ID,
        lead_time_start="2026-03-22T00:00:00Z",
        lead_time_end="2026-03-21T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )

    errors = valid_submitter.send_all(str(tmp_output))

    assert any("start must be before end" in e for e in errors)
    assert not (tmp_output / "alerts_object.json").exists()


def test_admin_area_missing_is_rejected(tmp_output: Path):
    """An alert with no admin-area exposure records at all is rejected."""
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


def test_naive_datetime_is_rejected():
    """A naive (no timezone) issued_at datetime is rejected at alert creation."""
    submitter = DataSubmitter()
    submitter.create_alert(
        alert_id=ALERT_ID,
        hazard_types=[HazardType.FLOODS],
        centroid=Centroid(latitude=1.0, longitude=37.0),
        issued_at=datetime(2026, 3, 20, 12, 0, 0),
        forecast_sources=[ForecastSource.GLOFAS],
    )

    assert ALERT_ID not in submitter._alerts
    assert "timezone-aware" in submitter.errors[f"create_alert:{ALERT_ID}"]
