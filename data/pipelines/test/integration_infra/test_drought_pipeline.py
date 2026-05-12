from pipelines.infra.data_types.data_config_types import OutputMode

# NOTE: These are pipeline-infra integration tests. They use the --scenario flag
# to bypass forecast.py entirely, exercising only the pipeline infrastructure
# (config parsing, data loading, data submission, output writing).
#
# Future "full-pipeline" integration tests will live in a separate folder and
# test the full pipeline end-to-end with controlled mock input data (e.g. mock
# ECMWF SEAS5 files) flowing through the actual forecast.py logic.


def test_drought_eth_scenario_no_alert(pipeline):
    """Run the drought pipeline for ETH with the no-alert scenario and verify
    the pipeline succeeds and produces zero alerts."""
    pipeline.clean_output("drought", "ETH")

    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.LOCAL},
        scenario="no-alert",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"

    latest = pipeline.find_latest_output("drought", "ETH")
    forecast = pipeline.load_forecast(latest)
    alerts = pipeline.load_alerts_allow_empty(latest)
    assert len(alerts) == 0
    assert forecast["hazardType"] == "drought"
    assert forecast["issuedAt"] == "2026-04-17T12:00:00Z"


def test_drought_eth_scenario_alert(pipeline):
    """Run the drought pipeline for ETH with the alert scenario and verify
    the pipeline produces exactly one scenario alert."""
    pipeline.clean_output("drought", "ETH")

    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.LOCAL},
        scenario="alert",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"

    latest = pipeline.find_latest_output("drought", "ETH")
    forecast = pipeline.load_forecast(latest)
    alerts = forecast["alerts"]
    assert len(alerts) == 1
    assert alerts[0]["eventName"] == "ETH_drought_scenario-alert"
    assert forecast["hazardType"] == "drought"
    assert forecast["issuedAt"] == "2026-04-17T12:00:00Z"
    pipeline.assert_alert_structure(alerts[0])
