def test_floods_ken_api(pipeline):
    """Run the flood pipeline for KEN against the live API. A zero exit code
    implies the API accepted all alerts, which—given server-side validation—
    implicitly asserts correct alert structure."""
    result = pipeline.run_pipeline("pipelines/infra/configs/floods.yaml", "DEBUG")
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
