def test_drought_eth(pipeline):
    pipeline.clean_output("drought", "ETH")

    result = pipeline.run_pipeline("pipelines/infra/configs/drought.yaml", "DEBUG")
    assert result.returncode == 0, f"Pipeline failed: {result.stderr}"

    latest = pipeline.find_latest_output("drought", "ETH")
    alerts = pipeline.load_alerts(latest)

    assert len(alerts) == 1

    alert = alerts[0]
    pipeline.assert_alert_structure(alert)
    assert alert["hazardTypes"] == ["drought"]
    assert alert["alertId"] == "ETH_drought_climate-region-B_season-MAM"
    assert "ECMWF" in alert["forecastSources"]

    for ts_entry in alert["timeSeriesData"]:
        assert ts_entry["severityKey"] == "percentile"

    admin_levels = {r["adminLevel"] for r in alert["exposure"]["admin-area"]}
    assert admin_levels == {1, 2}
