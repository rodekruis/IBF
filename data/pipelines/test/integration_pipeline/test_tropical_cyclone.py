"""Full-pipeline integration tests for tropical cyclones.

Runs the tropical cyclones pipeline WITHOUT --infra-only, exercising the actual forecast.py
logic with mock wind and track data from the seed-repo.

The --mock value selects which mock file to download:
  - 1 (MOCK_ALERT): storm identified in track and wind speed above threshold → triggers full alert path
  - 0 (MOCK_NO_ALERT): storm identified in track, but wind speed below threshold → no alerts produced
"""

import pytest


@pytest.mark.parametrize("mock", [1, 0])
def test_tropical_cyclone_pipeline(pipeline, mock):
    """Run the tropical cyclones pipeline end-to-end for PHL with mock wind and track data."""
    result = pipeline.run_pipeline(
        "pipelines/infra/configs/tropicalCyclone.yaml",
        mock,
        country="PHL",
    )
    assert (
        result.returncode == 0
    ), f"Pipeline failed (mock={mock}).\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
