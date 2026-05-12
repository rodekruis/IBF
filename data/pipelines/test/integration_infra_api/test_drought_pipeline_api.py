def test_drought_eth_api(pipeline):
    """Run the drought pipeline for ETH against the live API using the alert
    scenario. A zero exit code implies the API accepted the forecast, which—
    given server-side validation—implicitly asserts correct alert structure."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
        scenario="alert",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
