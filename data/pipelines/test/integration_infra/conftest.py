"""Shared pytest fixtures for pipeline-infra integration tests.

These tests use the --scenario flag to bypass forecast.py, exercising only
the pipeline infrastructure (config parsing, data loading, data submission,
output writing).

Future full-pipeline integration tests (with controlled mock input data
flowing through forecast.py) will live in a separate test folder.
"""

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import pytest

EXPECTED_ALERT_KEYS = {
    "eventName",
    "centroid",
    "severity",
    "exposure",
}

EXPECTED_FORECAST_KEYS = {
    "issuedAt",
    "hazardType",
    "forecastSources",
    "alerts",
}

EXPECTED_EXPOSURE_KEYS = {"adminAreas", "geoFeatures", "rasters"}

OUTPUT_BASE = Path("pipelines/output")


def _run_pipeline(
    config: str,
    run_target: str,
    extra_env: dict[str, str] | None = None,
    scenario: str | None = None,
    issued_at: str | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
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
    if issued_at:
        cmd.extend(["--issued-at", issued_at])

    return subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
    )


def _find_latest_output(hazard: str, country: str) -> Path:
    output_dir = OUTPUT_BASE / hazard / country
    subdirs = [d for d in output_dir.iterdir() if d.is_dir()]
    assert subdirs, f"No output directories in {output_dir}"
    return max(subdirs, key=lambda d: d.stat().st_mtime)


def _load_alerts(output_dir: Path) -> list[dict]:
    forecast = _load_forecast(output_dir)
    alerts = forecast["alerts"]
    assert isinstance(
        alerts, list
    ), "'forecast.json' field 'alerts' should be a JSON array"
    assert len(alerts) > 0, "'forecast.json' field 'alerts' should not be empty"
    return alerts


def _load_alerts_allow_empty(output_dir: Path) -> list[dict]:
    forecast = _load_forecast(output_dir)
    alerts = forecast["alerts"]
    assert isinstance(
        alerts, list
    ), "'forecast.json' field 'alerts' should be a JSON array"
    return alerts


def _load_forecast(output_dir: Path) -> dict:
    alerts_json = output_dir / "forecast.json"
    assert alerts_json.exists(), f"'forecast.json' not found in {output_dir}"

    with alerts_json.open("r", encoding="utf-8") as f:
        forecast = json.load(f)

    assert isinstance(forecast, dict), "'forecast.json' should contain a JSON object"
    assert EXPECTED_FORECAST_KEYS.issubset(
        forecast.keys()
    ), f"Forecast missing keys: {EXPECTED_FORECAST_KEYS - forecast.keys()}"
    return forecast


def _assert_alert_structure(alert: dict) -> None:
    assert EXPECTED_ALERT_KEYS.issubset(
        alert.keys()
    ), f"Alert missing keys: {EXPECTED_ALERT_KEYS - alert.keys()}"

    assert isinstance(alert["centroid"], dict)
    assert "latitude" in alert["centroid"]
    assert "longitude" in alert["centroid"]

    assert isinstance(alert["severity"], list)
    assert len(alert["severity"]) > 0

    for entry in alert["severity"]:
        assert "timeInterval" in entry
        assert isinstance(entry["timeInterval"], dict)
        assert "start" in entry["timeInterval"]
        assert "end" in entry["timeInterval"]
        assert "ensembleMemberType" in entry
        assert "severityKey" in entry
        assert "severityValue" in entry

    exposure = alert["exposure"]
    assert EXPECTED_EXPOSURE_KEYS.issubset(
        exposure.keys()
    ), f"Exposure missing keys: {EXPECTED_EXPOSURE_KEYS - exposure.keys()}"

    for admin_area in exposure["adminAreas"]:
        assert "placeCode" in admin_area
        assert "adminLevel" in admin_area
        assert "layer" in admin_area
        assert "value" in admin_area

    for geo_feature in exposure["geoFeatures"]:
        assert "geoFeatureId" in geo_feature
        assert "layer" in geo_feature
        assert "attributes" in geo_feature

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


@dataclass(frozen=True)
class PipelineHelpers:
    run_pipeline: Callable[..., subprocess.CompletedProcess[str]]
    find_latest_output: Callable[..., Path]
    load_forecast: Callable[..., dict]
    load_alerts: Callable[..., list[dict]]
    load_alerts_allow_empty: Callable[..., list[dict]]
    assert_alert_structure: Callable[..., None]
    clean_output: Callable[..., None]


@pytest.fixture()
def pipeline() -> PipelineHelpers:
    return PipelineHelpers(
        run_pipeline=_run_pipeline,
        find_latest_output=_find_latest_output,
        load_forecast=_load_forecast,
        load_alerts=_load_alerts,
        load_alerts_allow_empty=_load_alerts_allow_empty,
        assert_alert_structure=_assert_alert_structure,
        clean_output=_clean_output,
    )
