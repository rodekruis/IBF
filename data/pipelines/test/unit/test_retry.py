from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from pipelines.infra.utils.retry import retry

RETRY_MODULE = "pipelines.infra.utils.retry"


def test_retry_returns_result_without_retry_on_success() -> None:
    # Arrange
    function = MagicMock(return_value="result")
    decorated = retry(max_attempts=3, backoff_seconds=5, exceptions=(OSError,))(
        function
    )

    # Act
    result = decorated()

    # Assert
    assert result == "result"
    function.assert_called_once()


def test_retry_retries_until_success() -> None:
    # Arrange
    function = MagicMock(side_effect=[OSError(), OSError(), "result"])
    decorated = retry(max_attempts=3, backoff_seconds=5, exceptions=(OSError,))(
        function
    )

    # Act
    with patch(f"{RETRY_MODULE}.time.sleep") as mock_sleep:
        result = decorated()

    # Assert
    assert result == "result"
    assert function.call_count == 3
    assert mock_sleep.call_count == 2


def test_retry_raises_connection_error_after_attempts_exhausted() -> None:
    # Arrange
    function = MagicMock(side_effect=OSError("boom"))
    decorated = retry(
        max_attempts=3,
        backoff_seconds=5,
        exceptions=(OSError,),
        description=lambda filename: f"download '{filename}'",
    )(function)

    # Act & Assert
    with (
        patch(f"{RETRY_MODULE}.time.sleep"),
        pytest.raises(ConnectionError, match="download 'file.nc' after 3 attempts"),
    ):
        decorated("file.nc")


def test_retry_does_not_catch_other_exceptions() -> None:
    # Arrange
    function = MagicMock(side_effect=ValueError("not retryable"))
    decorated = retry(max_attempts=3, backoff_seconds=5, exceptions=(OSError,))(
        function
    )

    # Act & Assert
    with pytest.raises(ValueError, match="not retryable"):
        decorated()
    function.assert_called_once()


def test_retry_logs_every_failed_attempt() -> None:
    # Arrange
    function = MagicMock(side_effect=OSError("boom"))
    decorated = retry(max_attempts=3, backoff_seconds=5, exceptions=(OSError,))(
        function
    )

    # Act
    with (
        patch(f"{RETRY_MODULE}.time.sleep"),
        patch(f"{RETRY_MODULE}.log_warning") as mock_log_warning,
        pytest.raises(ConnectionError),
    ):
        decorated()

    # Assert
    messages = [call.args[2] for call in mock_log_warning.call_args_list]
    assert len(messages) == 3
    assert messages[0].endswith("Retrying in 5s")
    assert messages[1].endswith("Retrying in 10s")
    assert "Retrying" not in messages[2]


def test_retry_uses_linear_backoff() -> None:
    # Arrange
    function = MagicMock(side_effect=[OSError(), OSError(), "result"])
    decorated = retry(max_attempts=3, backoff_seconds=5, exceptions=(OSError,))(
        function
    )

    # Act
    with patch(f"{RETRY_MODULE}.time.sleep") as mock_sleep:
        decorated()

    # Assert
    assert [call.args[0] for call in mock_sleep.call_args_list] == [5, 10]
