"""Full-pipeline integration tests for floods.

Runs the floods pipeline WITHOUT --infra-only, exercising the actual forecast.py
logic with mock GloFAS discharge data from the seed-repo.

The --mock value selects which mock file to download:
  - 1 (MOCK_ALERT): discharge values above threshold → triggers full alert path
  - 0 (MOCK_NO_ALERT): discharge values below threshold → no alerts produced
"""

import pytest


@pytest.mark.parametrize("mock", [1, 0])
def test_floods_pipeline(pipeline, mock):
    """Run the floods pipeline end-to-end for ETH with mock GloFAS data."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/floods.yaml",
        mock,
        country="ETH",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed (mock={mock}).\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
