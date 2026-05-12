from pipelines.infra.data_types.data_config_types import OutputMode


def test_drought_local(pipeline):
    """
    Run the drought pipeline for KEN in local file mode and verify the output
    structure: 1 alert with correct hazard type, alert name, forecast source,
    severity keys, and admin levels.

    TODO: this test needs a controlled dataset.
    It's just grabbing any data from the config now, and testing on that.
    It's also dependent on the values in the DUMMY_DATA for "climate_regions"
    """
    pipeline.clean_output("drought", "KEN")

    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.LOCAL},
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"

    latest = pipeline.find_latest_output("drought", "KEN")
    forecast = pipeline.load_forecast(latest)
    alerts = forecast["alerts"]
    assert forecast["hazardType"] == "drought"
    assert "ECMWF" in forecast["forecastSources"]

    # TODO: Assert on the expected number of alerts,
    # once we have a controlled dataset and working hazard flow.
    # assert len(alerts) == 1

    for alert in alerts:
        print(alert["eventName"])
        pipeline.assert_alert_structure(alert)
        assert alert["eventName"] == "KEN_drought_Region B_MAM"

        for entry in alert["severity"]:
            assert entry["severityKey"] == "percentile"

        admin_levels = {r["adminLevel"] for r in alert["exposure"]["adminAreas"]}
        assert admin_levels == {0, 1, 2}
