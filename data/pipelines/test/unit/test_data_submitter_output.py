from pathlib import Path
from unittest.mock import patch

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.data_config_types import OutputMode


class TestLocalMode:
    def test_writes_file_on_success(
        self, valid_submitter: DataSubmitter, tmp_output: Path
    ):
        """Local mode writes forecast.json to the output directory."""
        errors = valid_submitter.send_all(OutputMode.LOCAL, str(tmp_output))

        assert errors == []
        assert (tmp_output / "forecast.json").exists()

    def test_returns_error_on_unwritable_path(
        self, valid_submitter: DataSubmitter, tmp_path: Path
    ):
        """Local mode returns an error when the output directory is not writable."""
        read_only_dir = tmp_path / "read_only"
        read_only_dir.mkdir()
        read_only_dir.chmod(0o444)
        output_path = str(read_only_dir / "nested" / "output")

        errors = valid_submitter.send_all(OutputMode.LOCAL, output_path)

        assert len(errors) == 1
        assert "Failed to write" in errors[0]

        read_only_dir.chmod(0o755)


class TestApiMode:
    @patch.dict(
        "os.environ",
        {"IBF_API_URL": "http://localhost:4000", "IBF_PIPELINE_API_KEY": "a" * 32},
    )
    @patch(
        "pipelines.infra.utils.api_client.ApiClient.submit_forecast", return_value=[]
    )
    def test_writes_file_and_cleans_up_on_success(
        self, _mock_submit, valid_submitter: DataSubmitter, tmp_output: Path
    ):
        """API mode writes file, submits to API, then removes file on success."""
        errors = valid_submitter.send_all(OutputMode.API, str(tmp_output))

        assert errors == []
        assert not tmp_output.exists()

    @patch.dict(
        "os.environ",
        {"IBF_API_URL": "http://localhost:4000", "IBF_PIPELINE_API_KEY": "a" * 32},
    )
    @patch(
        "pipelines.infra.utils.api_client.ApiClient.submit_forecast",
        return_value=["server error"],
    )
    def test_keeps_file_on_api_failure(
        self, _mock_submit, valid_submitter: DataSubmitter, tmp_output: Path
    ):
        """API mode keeps the local file when the API returns errors."""
        errors = valid_submitter.send_all(OutputMode.API, str(tmp_output))

        assert errors == ["server error"]
        assert (tmp_output / "forecast.json").exists()

    @patch.dict(
        "os.environ",
        {"IBF_API_URL": "http://localhost:4000", "IBF_PIPELINE_API_KEY": "a" * 32},
    )
    @patch(
        "pipelines.infra.utils.api_client.ApiClient.submit_forecast", return_value=[]
    )
    def test_still_submits_when_file_write_fails(
        self, mock_submit, valid_submitter: DataSubmitter, tmp_path: Path
    ):
        """API mode still submits to the API even if the local file write fails."""
        read_only_dir = tmp_path / "read_only"
        read_only_dir.mkdir()
        read_only_dir.chmod(0o444)
        output_path = str(read_only_dir / "nested" / "output")

        errors = valid_submitter.send_all(OutputMode.API, output_path)

        assert errors == []
        mock_submit.assert_called_once()

        read_only_dir.chmod(0o755)
