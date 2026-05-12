from pipelines.infra.data_types.data_config_types import OutputMode


def test_drought(pipeline):
    """Run the drought pipeline for KEN against the live API. A zero exit code
    implies the API accepted all alerts, which—given server-side validation—
    implicitly asserts correct alert structure."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.API},
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
