import pytest

# NOTE: These are pipeline-infra integration tests. They use the --infra-only
# flag to bypass forecast.py entirely, exercising only the pipeline
# infrastructure (config parsing, data loading, data submission, output
# writing). The --mock value sets the number of alerts.
#
# Tests in integration_pipeline are "full-pipeline" integration tests and
# test the full pipeline end-to-end with controlled mock input data
# flowing through the actual forecast.py logic.


@pytest.mark.parametrize("mock", [0, 1])
def test_drought_infra_only(pipeline, mock):
    """Run the drought pipeline for ETH with --infra-only and the --mock number
    of mock alerts. A zero exit code implies the API accepted the forecast,
    which—given server-side validation—implicitly asserts correct structure."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        mock=mock,
        infra_only=True,
        country="ETH",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
