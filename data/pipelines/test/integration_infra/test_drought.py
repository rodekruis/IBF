import pytest

from pipelines.infra.data_types.data_config_types import OutputMode

# NOTE: These are pipeline-infra integration tests. They use the --scenario flag
# to bypass forecast.py entirely, exercising only the pipeline infrastructure
# (config parsing, data loading, data submission, output writing).
#
# Tests in integration_pipeline are "full-pipeline" integration tests and
# test the full pipeline end-to-end with controlled mock input data
# flowing through the actual forecast.py logic.


@pytest.mark.parametrize("scenario", ["no-alert", "alert"])
def test_drought_scenario(pipeline, scenario):
    """Run the drought pipeline for ETH with the specified scenario. A zero exit
    code implies the API accepted the forecast, which—given server-side
    validation—implicitly asserts correct structure."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "SCENARIO",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.API},
        scenario=scenario,
        country="ETH",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
