from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import requests
from pipelines.infra.utils.api_client import ApiClient


class TestApiClientInit:
    @patch.dict("os.environ", {"IBF_PIPELINE_API_KEY": "a" * 32})
    def test_sets_api_key_header(self) -> None:
        """Valid API key is stored in the session's x-api-key header."""
        client = ApiClient("http://localhost:4000")
        assert client._session.headers["x-api-key"] == "a" * 32

    @patch.dict("os.environ", {"IBF_PIPELINE_API_KEY": ""})
    def test_raises_when_api_key_empty(self) -> None:
        """Empty API key raises ValueError at construction time."""
        with pytest.raises(ValueError, match="IBF_PIPELINE_API_KEY"):
            ApiClient("http://localhost:4000")

    @patch.dict("os.environ", {}, clear=True)
    def test_raises_when_api_key_missing(self) -> None:
        """Missing API key env var raises ValueError at construction time."""
        with pytest.raises(ValueError, match="IBF_PIPELINE_API_KEY"):
            ApiClient("http://localhost:4000")

    @patch.dict("os.environ", {"IBF_PIPELINE_API_KEY": "a" * 32})
    def test_strips_trailing_slash_from_base_url(self) -> None:
        """Trailing slash is stripped from the base URL to avoid double slashes."""
        client = ApiClient("http://localhost:4000/")
        assert client._base_url == "http://localhost:4000"


class TestSubmitAlerts:
    def setup_method(self) -> None:
        with patch.dict("os.environ", {"IBF_PIPELINE_API_KEY": "a" * 32}):
            self.client = ApiClient("http://localhost:4000")

    @patch.object(requests.Session, "post")
    def test_returns_empty_list_on_success(self, mock_post: MagicMock) -> None:
        """Successful 201 response returns an empty error list."""
        mock_post.return_value = MagicMock(status_code=201)
        result = self.client.submit_forecast({})
        assert result == []

    @patch.object(requests.Session, "post")
    def test_returns_errors_from_json_response(self, mock_post: MagicMock) -> None:
        """Error response with an 'errors' array returns those errors directly."""
        response = MagicMock(status_code=400)
        response.json.return_value = {
            "errors": ["severity missing", "centroid invalid"]
        }
        mock_post.return_value = response
        result = self.client.submit_forecast({})
        assert result == ["severity missing", "centroid invalid"]

    @patch.object(requests.Session, "post")
    def test_returns_message_when_no_errors_key(self, mock_post: MagicMock) -> None:
        """Error response without 'errors' key falls back to the 'message' field."""
        response = MagicMock(status_code=500)
        response.json.return_value = {"message": "Internal Server Error"}
        mock_post.return_value = response
        result = self.client.submit_forecast({})
        assert result == ["Internal Server Error"]

    @patch.object(requests.Session, "post")
    def test_returns_raw_text_on_json_parse_failure(self, mock_post: MagicMock) -> None:
        """Non-JSON error response falls back to raw text with status code."""
        response = MagicMock(status_code=502)
        response.json.side_effect = ValueError("not json")
        response.text = "Bad Gateway"
        mock_post.return_value = response
        result = self.client.submit_forecast({})
        assert result == ["API returned 502: Bad Gateway"]
