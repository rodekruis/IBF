import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

EXPECTED_ALERT_KEYS = {
    "alertId",
    "issuedAt",
    "centroid",
    "hazardType",
    "forecastSources",
    "timeSeriesData",
    "exposure",
}

EXPECTED_EXPOSURE_KEYS = {"admin-area", "geo-features", "rasters"}

OUTPUT_BASE = Path("pipelines/output")


def _run_pipeline(config: str, run_target: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pipelines.infra.run_forecasts",
            "--config",
            config,
            "--run-target",
            run_target,
        ],
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )


def _find_latest_output(hazard: str, country: str) -> Path:
    output_dir = OUTPUT_BASE / hazard / country
    subdirs = [d for d in output_dir.iterdir() if d.is_dir()]
    assert subdirs, f"No output directories in {output_dir}"
    return max(subdirs, key=lambda d: d.stat().st_mtime)


def _load_alerts(output_dir: Path) -> list[dict]:
    alerts_json = output_dir / "alerts_object.json"
    assert alerts_json.exists(), f"'alerts_object.json' not found in {output_dir}"

    with alerts_json.open("r", encoding="utf-8") as f:
        alerts = json.load(f)

    assert isinstance(alerts, list), "'alerts_object.json' should contain a JSON array"
    assert len(alerts) > 0, "'alerts_object.json' should not be empty"
    return alerts


def _assert_alert_structure(alert: dict) -> None:
    assert EXPECTED_ALERT_KEYS.issubset(
        alert.keys()
    ), f"Alert missing keys: {EXPECTED_ALERT_KEYS - alert.keys()}"

    assert isinstance(alert["centroid"], dict)
    assert "latitude" in alert["centroid"]
    assert "longitude" in alert["centroid"]

    assert isinstance(alert["hazardType"], list)
    assert len(alert["hazardType"]) > 0

    assert isinstance(alert["timeSeriesData"], list)
    assert len(alert["timeSeriesData"]) > 0

    for ts_entry in alert["timeSeriesData"]:
        assert "leadTime" in ts_entry
        assert isinstance(ts_entry["leadTime"], list)
        assert len(ts_entry["leadTime"]) == 2
        assert "ensembleMember" in ts_entry
        assert "severityKey" in ts_entry
        assert "severityValue" in ts_entry

    exposure = alert["exposure"]
    assert EXPECTED_EXPOSURE_KEYS.issubset(
        exposure.keys()
    ), f"Exposure missing keys: {EXPECTED_EXPOSURE_KEYS - exposure.keys()}"

    for admin_area in exposure["admin-area"]:
        assert "placeCode" in admin_area
        assert "layer" in admin_area
        assert "value" in admin_area

    for geo_feature in exposure["geo-features"]:
        assert "geoFeatureId" in geo_feature
        assert "layer" in geo_feature
        assert "value" in geo_feature

    for raster in exposure["rasters"]:
        assert "layer" in raster
        assert "value" in raster
        assert "extent" in raster
        extent = raster["extent"]
        for coord_key in ("xmin", "ymin", "xmax", "ymax"):
            assert coord_key in extent


def _clean_output(hazard: str, country: str) -> None:
    target = OUTPUT_BASE / hazard / country
    if target.exists():
        shutil.rmtree(target)


def test_floods_ken():
    _clean_output("floods", "KEN")

    result = _run_pipeline("pipelines/infra/configs/floods.yaml", "DEBUG")
    assert result.returncode == 0, f"Pipeline failed: {result.stderr}"

    latest = _find_latest_output("floods", "KEN")
    alerts = _load_alerts(latest)

    assert len(alerts) == 2

    for alert in alerts:
        _assert_alert_structure(alert)
        assert alert["hazardType"] == ["floods"]
        assert "glofas" in alert["forecastSources"]

    alert_ids = {a["alertId"] for a in alerts}
    assert "KEN_floods_glofas-station-A" in alert_ids
    assert "KEN_floods_glofas-station-B" in alert_ids


def test_drought_eth():
    _clean_output("drought", "ETH")

    result = _run_pipeline("pipelines/infra/configs/drought.yaml", "DEBUG")
    assert result.returncode == 0, f"Pipeline failed: {result.stderr}"

    latest = _find_latest_output("drought", "ETH")
    alerts = _load_alerts(latest)

    assert len(alerts) == 1

    alert = alerts[0]
    _assert_alert_structure(alert)
    assert alert["hazardType"] == ["drought"]
    assert alert["alertId"] == "ETH_drought_climate-region-B_season-MAM"
    assert "ECMWF" in alert["forecastSources"]

    for ts_entry in alert["timeSeriesData"]:
        assert ts_entry["severityKey"] == "percentile"
