import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.data_config_types import OutputMode
from pipelines.infra.data_types.enums import ForecastSource, HazardType


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

    def test_writes_forecast_with_empty_alerts_when_no_alerts_created(
        self, tmp_output: Path
    ):
        """Local mode writes a valid forecast envelope with empty alerts when no alerts are created."""
        api_client = MagicMock()
        submitter = DataSubmitter(api_client)
        submitter.set_forecast_metadata(
            issued_at=datetime.now(timezone.utc),
            hazard_type=HazardType.FLOODS,
            forecast_sources=[ForecastSource.GLOFAS],
        )

        errors = submitter.send_all(OutputMode.LOCAL, str(tmp_output))

        assert errors == []
        file_path = tmp_output / "forecast.json"
        assert file_path.exists()
        with file_path.open("r", encoding="utf-8") as f:
            forecast = json.load(f)

        assert forecast["hazardType"] == "floods"
        assert forecast["forecastSources"] == ["glofas"]
        assert forecast["alerts"] == []


class TestApiMode:
    def test_writes_file_and_cleans_up_on_success(
        self,
        mock_api_client: MagicMock,
        valid_submitter: DataSubmitter,
        tmp_output: Path,
    ):
        """API mode writes file, submits to API, then removes file on success."""
        mock_api_client.submit_forecast.return_value = []

        errors = valid_submitter.send_all(OutputMode.API, str(tmp_output))

        assert errors == []
        assert not tmp_output.exists()

    def test_keeps_file_on_api_failure(
        self,
        mock_api_client: MagicMock,
        valid_submitter: DataSubmitter,
        tmp_output: Path,
    ):
        """API mode keeps the local file when the API returns errors."""
        mock_api_client.submit_forecast.return_value = ["server error"]

        errors = valid_submitter.send_all(OutputMode.API, str(tmp_output))

        assert errors == ["server error"]
        assert (tmp_output / "forecast.json").exists()

    def test_still_submits_when_file_write_fails(
        self, mock_api_client: MagicMock, valid_submitter: DataSubmitter, tmp_path: Path
    ):
        """API mode still submits to the API even if the local file write fails."""
        mock_api_client.submit_forecast.return_value = []
        read_only_dir = tmp_path / "read_only"
        read_only_dir.mkdir()
        read_only_dir.chmod(0o444)
        output_path = str(read_only_dir / "nested" / "output")

        errors = valid_submitter.send_all(OutputMode.API, output_path)

        assert errors == []
        mock_api_client.submit_forecast.assert_called_once()

        read_only_dir.chmod(0o755)

    def test_posts_forecast_with_empty_alerts_when_no_alerts_created(
        self, tmp_output: Path
    ):
        """API mode posts a valid forecast envelope with empty alerts when no alerts are created."""
        mock_client = MagicMock()
        mock_client.submit_forecast.return_value = []
        submitter = DataSubmitter(mock_client)
        submitter.set_forecast_metadata(
            issued_at=datetime.now(timezone.utc),
            hazard_type=HazardType.FLOODS,
            forecast_sources=[ForecastSource.GLOFAS],
        )

        errors = submitter.send_all(OutputMode.API, str(tmp_output))

        assert errors == []
        mock_client.submit_forecast.assert_called_once()
        submitted_forecast = mock_client.submit_forecast.call_args.args[0]
        assert submitted_forecast["hazardType"] == "floods"
        assert submitted_forecast["forecastSources"] == ["glofas"]
        assert submitted_forecast["alerts"] == []
