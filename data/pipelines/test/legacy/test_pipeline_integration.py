import json
import os
import subprocess
import sys
from pathlib import Path


def test_pipeline_riverflood_ken():
    result = subprocess.run(
        [
            sys.executable,
            "pipelines/legacy/pipeline.py",
            "--hazard",
            "riverflood",
            "--country",
            "KEN",
            "--prepare",
            "--forecast",
            "--send",
            "--debug",
        ],
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )

    # Assert process completed successfully
    assert result.returncode == 0, f"Pipeline failed: {result.stderr}"

    # Find output directories matching KEN_riverflood_*
    output_base = Path("data/output")
    output_dirs = list(output_base.glob("KEN_riverflood_*"))
    assert output_dirs, "No output directories were created by the pipeline"

    # Check that at least one file exists in the latest output directory
    latest_output_dir = max(output_dirs, key=lambda d: d.stat().st_mtime)
    events_json = latest_output_dir / "events.json"
    assert events_json.exists(), f"'events.json' was not created in {latest_output_dir}"

    with events_json.open("r", encoding="utf-8") as events_file:
        events = json.load(events_file)

    assert isinstance(events, list), "'events.json' should contain a JSON array"
    assert len(events) > 0, "'events.json' should not be an empty array"

    first_event = events[0]
    assert isinstance(first_event, dict), "Each event should be a JSON object"
    assert first_event.get("country") == "KEN"
    assert first_event.get("hazard") == "flood"
    assert isinstance(first_event.get("event_name"), str)
    assert first_event.get("event_name") != ""
    assert isinstance(first_event.get("lead_time"), str)
    assert isinstance(first_event.get("alert_areas"), dict)
    assert isinstance(first_event.get("glofas_stations"), dict)


def test_pipeline_drought_eth():
    result = subprocess.run(
        [
            sys.executable,
            "pipelines/legacy/pipeline.py",
            "--hazard",
            "drought",
            "--country",
            "ETH",
            "--prepare",
            "--forecast",
            "--send",
            "--debug",
        ],
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"Pipeline failed: {result.stderr}"

    output_base = Path("data/output")
    output_dirs = list(output_base.glob("ETH_drought_*"))
    assert output_dirs, "No output directories were created by the pipeline"

    # Check that at least one file exists in the latest output directory
    latest_output_dir = max(output_dirs, key=lambda d: d.stat().st_mtime)
    events_json = latest_output_dir / "events.json"
    assert events_json.exists(), f"'events.json' was not created in {latest_output_dir}"
