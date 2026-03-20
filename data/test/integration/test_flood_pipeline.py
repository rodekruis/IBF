def test_floods_ken(pipeline):
    pipeline.clean_output("floods", "KEN")

    result = pipeline.run_pipeline("pipelines/infra/configs/floods.yaml", "DEBUG")
    assert result.returncode == 0, f"Pipeline failed: {result.stderr}"

    latest = pipeline.find_latest_output("floods", "KEN")
    alerts = pipeline.load_alerts(latest)

    assert len(alerts) == 2

    for alert in alerts:
        pipeline.assert_alert_structure(alert)
        assert alert["hazardTypes"] == ["floods"]
        assert "glofas" in alert["forecastSources"]

    alert_ids = {a["alertId"] for a in alerts}
    assert "KEN_floods_glofas-station-A" in alert_ids
    assert "KEN_floods_glofas-station-B" in alert_ids
