"""Full-pipeline integration tests for floods.

Runs the floods pipeline WITHOUT --scenario, exercising the actual forecast.py
logic with mock GloFAS discharge data from the seed-repo.

The run target selects which mock file to download:
  - MOCK_ALERT: discharge values above threshold → triggers full alert path
  - MOCK_NO_ALERT: discharge values below threshold → no alerts produced
"""

import pytest


@pytest.mark.parametrize("run_target", ["MOCK_ALERT", "MOCK_NO_ALERT"])
def test_floods_pipeline(pipeline, run_target):
    """Run the floods pipeline end-to-end for ETH with mock GloFAS data."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/floods.yaml",
        run_target,
        country="ETH",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed (run_target={run_target}).\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
