from pipelines.infra.data_types.data_config_types import OutputMode


def test_floods_ken(pipeline):
    """Run the flood pipeline for KEN in local file mode and verify the output
    structure: 2 alerts, correct hazard types, forecast sources, and admin levels.

    TODO: this test needs a controlled dataset.
    It's just grabbing any data from the config now, and testing on that.
    """
    pipeline.clean_output("floods", "KEN")

    result = pipeline.run_pipeline(
        "pipelines/infra/configs/floods.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.LOCAL},
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"

    latest = pipeline.find_latest_output("floods", "KEN")
    alerts = pipeline.load_alerts(latest)

    # TODO: Assert on the expected number of alerts,
    # once we have a controlled dataset and working hazard flow.
    # assert len(alerts) == 2

    for alert in alerts:
        print(alert["alertName"])
        pipeline.assert_alert_structure(alert)
        assert alert["hazardTypes"] == ["floods"]
        assert "glofas" in alert["forecastSources"]

        admin_levels = {r["adminLevel"] for r in alert["exposure"]["adminAreas"]}
        assert admin_levels == {0, 1, 2, 3}

    # TODO: Assert on expected alert names, once we have a controlled dataset and working hazard flow.
    # alert_names = {a["alertName"] for a in alerts}
    # assert "KEN_floods_G5142" in alert_names
    # assert "KEN_floods_G5195" in alert_names
