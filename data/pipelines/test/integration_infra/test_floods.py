from pipelines.infra.data_types.data_config_types import OutputMode

# NOTE: These are pipeline-infra integration tests. They use the --scenario flag
# to bypass forecast.py entirely, exercising only the pipeline infrastructure
# (config parsing, data loading, data submission, output writing).
#
# Future "full-pipeline" integration tests will live in a separate folder and
# test the full pipeline end-to-end with controlled mock input data (e.g. mock
# GloFAS files) flowing through the actual forecast.py logic.


def test_floods_scenario_no_alert(pipeline):
    """Run the flood pipeline for KEN with the no-alert scenario. A zero exit
    code implies the API accepted the forecast, which—given server-side
    validation—implicitly asserts correct structure."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/floods.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.API},
        scenario="no-alert",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"


def test_floods_scenario_alert(pipeline):
    """Run the flood pipeline for KEN with the alert scenario. A zero exit
    code implies the API accepted the alert, which—given server-side
    validation—implicitly asserts correct alert structure."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/floods.yaml",
        "DEBUG",
        extra_env={"IBF_OUTPUT_MODE": OutputMode.API},
        scenario="alert",
        issued_at="2026-04-17T12:00:00Z",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
