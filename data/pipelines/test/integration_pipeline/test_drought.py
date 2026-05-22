"""Full-pipeline integration test for drought.

Runs the drought pipeline WITHOUT --scenario, exercising the actual forecast.py
logic. A zero exit code means the API accepted the forecast, implicitly asserting
correct output structure.

This test serves as a regression guard while forecast.py contains placeholder
logic that is not yet replaced with real hazard-specific computations.

For floods these tests will be added in AB#41516, but for droughts we will not replace forecast.py by actual logic soon, so we keep this test to make sure it keeps working.
"""


def test_drought_pipeline(pipeline):
    """Run the drought pipeline end-to-end for ETH."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/drought.yaml",
        "DEBUG",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed.\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
