def test_drought_eth(pipeline):
    """Run the drought pipeline for ETH in local file mode and verify the output
    structure: 1 alert with correct hazard type, alert name, forecast source,
    severity keys, and admin levels."""
    pipeline.clean_output("drought", "ETH")

    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": "local"},
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"

    latest = pipeline.find_latest_output("drought", "ETH")
    alerts = pipeline.load_alerts(latest)

    assert len(alerts) == 1

    alert = alerts[0]
    pipeline.assert_alert_structure(alert)
    assert alert["hazardTypes"] == ["drought"]
    assert alert["alertName"] == "ETH_drought_climate-region-B_season-MAM"
    assert "ECMWF" in alert["forecastSources"]

    for entry in alert["severityData"]:
        assert entry["severityKey"] == "percentile"

    admin_levels = {r["adminLevel"] for r in alert["exposure"]["adminArea"]}
    assert admin_levels == {1, 2}
