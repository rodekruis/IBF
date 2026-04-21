from datetime import datetime, timezone
from pathlib import Path

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.alert_types import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)
from pipelines.infra.data_types.data_config_types import OutputMode

EVENT_NAME = "KEN_floods_station-test"


def test_incomplete_alert_is_rejected(tmp_output: Path):
    """An alert with only metadata and no severity/exposure data is rejected."""
    submitter = DataSubmitter()
    submitter.set_forecast_metadata(
        issued_at=datetime.now(timezone.utc),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
    )
    submitter.create_alert(
        event_name=EVENT_NAME,
        centroid=Centroid(latitude=1.0, longitude=37.0),
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert len(errors) > 0
    assert any("no severity data" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_severity_missing_median_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A time interval with ensemble runs but no median record is rejected."""
    valid_submitter.add_severity_data(
        event_name=EVENT_NAME,
        time_interval_start="2026-03-21T00:00:00Z",
        time_interval_end="2026-03-21T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("expected 1 median record, found 0" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_severity_missing_ensemble_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A time interval with a median but no ensemble runs is rejected."""
    valid_submitter.add_severity_data(
        event_name=EVENT_NAME,
        time_interval_start="2026-03-21T00:00:00Z",
        time_interval_end="2026-03-21T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="water_discharge",
        severity_value=0,
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("at least 1 ensemble-run record" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_admin_area_unequal_layer_counts_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """Admin-area data with different numbers of place codes per layer are rejected."""
    valid_submitter.add_admin_area_exposure(
        event_name=EVENT_NAME,
        place_code="PC001",
        admin_level=3,
        layer=Layer.SPATIAL_EXTENT,
        value=True,
    )
    valid_submitter.add_admin_area_exposure(
        event_name=EVENT_NAME,
        place_code="PC002",
        admin_level=3,
        layer=Layer.SPATIAL_EXTENT,
        value=True,
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("record count differs across layers" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_raster_missing_alert_extent_is_rejected(tmp_output: Path):
    """Raster exposure without the required 'alert_extent' layer is rejected."""
    submitter = DataSubmitter()
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
        layer="some_other_layer",
        value="other.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("missing required 'alert_extent' layer" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_centroid_out_of_range_is_rejected(tmp_output: Path):
    """A centroid with latitude or longitude outside valid WGS84 bounds is rejected."""
    submitter = DataSubmitter()
    submitter.set_forecast_metadata(
        issued_at=datetime.now(timezone.utc),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
    )
    submitter.create_alert(
        event_name=EVENT_NAME,
        centroid=Centroid(latitude=91.0, longitude=200.0),
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
        layer="alert_extent",
        value="alert_extent.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("latitude 91.0 out of range" in e for e in errors)
    assert any("longitude 200.0 out of range" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_raster_invalid_extent_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A raster whose xmin >= xmax or ymin >= ymax is rejected."""
    valid_submitter.add_raster_exposure(
        event_name=EVENT_NAME,
        layer="flood_depth",
        value="flood_depth.tif",
        extent={"xmin": 38.0, "ymin": 2.0, "xmax": 36.0, "ymax": 0.0},
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("invalid extent" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_time_interval_start_after_end_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A time interval whose start timestamp is after its end timestamp is rejected."""
    valid_submitter.add_severity_data(
        event_name=EVENT_NAME,
        time_interval_start="2026-03-22T00:00:00Z",
        time_interval_end="2026-03-21T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.RUN,
        severity_key="water_discharge",
        severity_value=0,
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("start must be before end" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_admin_area_missing_is_rejected(tmp_output: Path):
    """An alert with no admin-area exposure records at all is rejected."""
    submitter = DataSubmitter()
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
    submitter.add_raster_exposure(
        event_name=EVENT_NAME,
        layer="alert_extent",
        value="alert_extent.tif",
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("expected at least 1 record" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_naive_datetime_is_rejected(tmp_output: Path):
    """A naive (no timezone) issued_at datetime is rejected during integrity checks."""
    submitter = DataSubmitter()
    submitter.set_forecast_metadata(
        issued_at=datetime(2026, 3, 20, 12, 0, 0),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("timezone-aware" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_hazard_type_missing_is_rejected(tmp_output: Path):
    """Forecast metadata with no hazard type is rejected during integrity checks."""
    submitter = DataSubmitter()
    submitter.set_forecast_metadata(
        issued_at=datetime.now(timezone.utc),
        hazard_type=None,  # type: ignore
        forecast_sources=[ForecastSource.GLOFAS],
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("hazard_type must be set" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_empty_forecast_sources_is_rejected(tmp_output: Path):
    """Forecast metadata with no forecast sources is rejected during integrity checks."""
    submitter = DataSubmitter()
    submitter.set_forecast_metadata(
        issued_at=datetime.now(timezone.utc),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[],
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any(
        "forecast_sources must contain at least one forecast source" in e
        for e in errors
    )
    assert not (tmp_output / "forecast.json").exists()
