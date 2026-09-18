from datetime import datetime, UTC
from pathlib import Path
from typing import cast
from unittest.mock import MagicMock

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.data_config_types import OutputMode
from pipelines.infra.data_types.dtos import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    LayerName,
    SeverityKey,
    WaterDischargeTimeSeriesEntry,
)
from pipelines.infra.utils.raster import PLACEHOLDER_RASTER_BASE64

EVENT_NAME = "station-test"


def test_incomplete_alert_is_rejected(tmp_output: Path):
    """An alert with only metadata and no severity/exposure data is rejected."""
    submitter = DataSubmitter(MagicMock())
    submitter.set_forecast_metadata(
        issued_at=datetime.now(UTC),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
        country_code_iso3="ETH",
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
        severity_key=SeverityKey.RETURN_PERIOD,
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
        severity_key=SeverityKey.RETURN_PERIOD,
        severity_value=0,
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("at least 1 ensemble-run record" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_admin_area_unequal_layer_counts_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """Admin-area data with different numbers of place codes per layer are rejected."""
    # Add 2 records of another layer, while valid_submitter only has 1 population_exposed record
    valid_submitter.add_admin_area_exposure(
        event_name=EVENT_NAME,
        admin_level=3,
        layer=LayerName.FLOOD_DEPTH,  # not actually an admin-area layer, but works to test the record count validation
        values_by_place_code={"PC001": 1, "PC002": 1},
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("record count differs across layers" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_centroid_out_of_range_is_rejected(tmp_output: Path):
    """A centroid with latitude or longitude outside valid WGS84 bounds is rejected."""
    submitter = DataSubmitter(MagicMock())
    submitter.set_forecast_metadata(
        issued_at=datetime.now(UTC),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
        country_code_iso3="ETH",
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
        layer=LayerName.POPULATION_EXPOSED,
        values_by_place_code={"PC001": 0},
    )
    submitter.add_raster_exposure(
        event_name=EVENT_NAME,
        layer=LayerName.FLOOD_DEPTH,
        value_greyscale=PLACEHOLDER_RASTER_BASE64,
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
        layer=LayerName.FLOOD_DEPTH,
        value_greyscale=PLACEHOLDER_RASTER_BASE64,
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
        severity_key=SeverityKey.RETURN_PERIOD,
        severity_value=0,
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("start must be before end" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_admin_area_missing_is_rejected(tmp_output: Path):
    """An alert with no admin-area exposure records at all is rejected."""
    submitter = DataSubmitter(MagicMock())
    submitter.set_forecast_metadata(
        issued_at=datetime.now(UTC),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
        country_code_iso3="ETH",
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
    submitter.add_raster_exposure(
        event_name=EVENT_NAME,
        layer=LayerName.FLOOD_DEPTH,
        value_greyscale=PLACEHOLDER_RASTER_BASE64,
        extent={"xmin": 36.0, "ymin": 0.0, "xmax": 38.0, "ymax": 2.0},
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("expected at least 1 record" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_naive_datetime_is_rejected(tmp_output: Path):
    """A naive (no timezone) issued_at datetime is rejected during integrity checks."""
    submitter = DataSubmitter(MagicMock())
    submitter.set_forecast_metadata(
        issued_at=datetime(2026, 3, 20, 12, 0, 0),  # noqa: DTZ001
        hazard_type=HazardType.FLOODS,
        forecast_sources=[ForecastSource.GLOFAS],
        country_code_iso3="ETH",
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("timezone-aware" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_hazard_type_missing_is_rejected(tmp_output: Path):
    """Forecast metadata with no hazard type is rejected during integrity checks."""
    submitter = DataSubmitter(MagicMock())
    submitter.set_forecast_metadata(
        issued_at=datetime.now(UTC),
        hazard_type=None,  # type: ignore
        forecast_sources=[ForecastSource.GLOFAS],
        country_code_iso3="ETH",
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("hazard_type must be set" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_empty_forecast_sources_is_rejected(tmp_output: Path):
    """Forecast metadata with no forecast sources is rejected during integrity checks."""
    submitter = DataSubmitter(MagicMock())
    submitter.set_forecast_metadata(
        issued_at=datetime.now(UTC),
        hazard_type=HazardType.FLOODS,
        forecast_sources=[],
        country_code_iso3="ETH",
    )

    errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any(
        "forecast_sources must contain at least one forecast source" in e
        for e in errors
    )
    assert not (tmp_output / "forecast.json").exists()


def test_negative_population_exposed_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """An admin-area record with negative population_exposed value is rejected."""
    valid_submitter.add_admin_area_exposure(
        event_name=EVENT_NAME,
        admin_level=3,
        layer=LayerName.POPULATION_EXPOSED,
        values_by_place_code={"PC002": -100},
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("must be non-negative" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_valid_is_accepted(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A well-formed waterDischarge time series produces no integrity errors."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={
            "waterDischarge": [
                WaterDischargeTimeSeriesEntry(
                    start="2026-03-20T00:00:00Z",
                    end="2026-03-20T23:59:59Z",
                    median=100.0,
                    low=80.0,
                    high=120.0,
                )
            ]
        },
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert errors == []
    assert (tmp_output / "forecast.json").exists()


def test_water_discharge_empty_time_series_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A waterDischarge attribute with no time series entries is rejected."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={"waterDischarge": []},
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("no time series entries" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_start_after_end_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A waterDischarge entry whose start is after its end is rejected."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={
            "waterDischarge": [
                WaterDischargeTimeSeriesEntry(
                    start="2026-03-21T00:00:00Z",
                    end="2026-03-20T00:00:00Z",
                    median=100.0,
                    low=80.0,
                    high=120.0,
                )
            ]
        },
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("start must be before end" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_median_outside_low_high_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A waterDischarge entry whose median falls outside [low, high] is rejected."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={
            "waterDischarge": [
                WaterDischargeTimeSeriesEntry(
                    start="2026-03-20T00:00:00Z",
                    end="2026-03-20T23:59:59Z",
                    median=200.0,
                    low=80.0,
                    high=120.0,
                )
            ]
        },
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("expected low <= median <= high" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_negative_low_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A waterDischarge entry with a negative 'low' value is rejected."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={
            "waterDischarge": [
                WaterDischargeTimeSeriesEntry(
                    start="2026-03-20T00:00:00Z",
                    end="2026-03-20T23:59:59Z",
                    median=0.0,
                    low=-10.0,
                    high=10.0,
                )
            ]
        },
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("must be non-negative" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_non_list_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A non-list waterDischarge is caught by the integrity check (would otherwise raise TypeError)."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={"waterDischarge": "not-a-list"},
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("must be a list" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_entry_missing_keys_is_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A waterDischarge entry missing required keys is caught by the integrity check (would otherwise raise KeyError)."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={
            "waterDischarge": cast(
                list[WaterDischargeTimeSeriesEntry],
                [{"start": "2026-03-20T00:00:00Z", "median": 100.0}],
            )
        },
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("missing keys: end, high, low" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()


def test_water_discharge_non_iso_timestamps_are_rejected(
    valid_submitter: DataSubmitter, tmp_output: Path
):
    """A waterDischarge entry with unparseable timestamps is caught by the integrity check (would otherwise raise ValueError)."""
    valid_submitter.add_geo_feature_exposure(
        event_name=EVENT_NAME,
        geo_feature_id="G1",
        layer=LayerName.GLOFAS_STATIONS,
        attributes={
            "waterDischarge": [
                WaterDischargeTimeSeriesEntry(
                    start="tomorrow",
                    end="2026-03-20T23:59:59Z",
                    median=100.0,
                    low=80.0,
                    high=120.0,
                )
            ]
        },
    )

    errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

    assert any("must be ISO 8601 timestamps" in e for e in errors)
    assert not (tmp_output / "forecast.json").exists()
