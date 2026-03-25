def test_drought_eth_api(pipeline):
    """Run the drought pipeline for ETH against the live API. A zero exit code
    implies the API accepted all alerts, which—given server-side validation—
    implicitly asserts correct alert structure."""
    result = pipeline.run_pipeline("pipelines/infra/configs/drought.yaml", "DEBUG")
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
