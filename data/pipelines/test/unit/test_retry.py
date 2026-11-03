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


def test_retry_raises_connection_error_labelled_by_description() -> None:
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
        pytest.raises(
            ConnectionError,
            match=r"^Failed to download 'file\.nc' after 3 attempts$",
        ),
    ):
        decorated("file.nc")


def test_retry_raises_connection_error_labelled_by_function_name() -> None:
    # Arrange
    decorated = retry(max_attempts=3, backoff_seconds=5, exceptions=(OSError,))(
        _failing_download
    )

    # Act & Assert
    with (
        patch(f"{RETRY_MODULE}.time.sleep"),
        pytest.raises(
            ConnectionError,
            match=r"^Failed to _failing_download after 3 attempts$",
        ),
    ):
        decorated()


def _failing_download() -> None:
    raise OSError("boom")


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


def test_retry_raises_value_error_for_zero_max_attempts() -> None:
    # Arrange
    function = MagicMock(return_value="result")

    # Act & Assert
    with pytest.raises(ValueError, match="max_attempts needs to be larger than 0"):
        retry(max_attempts=0, backoff_seconds=5, exceptions=(OSError,))(function)


def test_retry_raises_value_error_for_negative_max_attempts() -> None:
    # Arrange
    function = MagicMock(return_value="result")

    # Act & Assert
    with pytest.raises(ValueError, match="max_attempts needs to be larger than 0"):
        retry(max_attempts=-1, backoff_seconds=5, exceptions=(OSError,))(function)


def test_retry_logs_retry_delay_for_each_non_final_failed_attempt() -> None:
    # Arrange
    function = MagicMock(side_effect=OSError("boom"))
    decorated = retry(
        max_attempts=3,
        backoff_seconds=5,
        exceptions=(OSError,),
        description=lambda: "download",
    )(function)

    # Act
    with (
        patch(f"{RETRY_MODULE}.time.sleep"),
        patch(f"{RETRY_MODULE}.log_warning") as mock_log_warning,
        pytest.raises(ConnectionError),
    ):
        decorated()

    # Assert
    messages = [call.args[2] for call in mock_log_warning.call_args_list]
    assert (
        messages[0]
        == "Attempt 1/3 failed for download: OSError('boom'). Retrying in 5s"
    )
    assert (
        messages[1]
        == "Attempt 2/3 failed for download: OSError('boom'). Retrying in 10s"
    )


def test_retry_logs_final_failed_attempt_without_retry_delay() -> None:
    # Arrange
    function = MagicMock(side_effect=OSError("boom"))
    decorated = retry(
        max_attempts=3,
        backoff_seconds=5,
        exceptions=(OSError,),
        description=lambda: "download",
    )(function)

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
    assert messages[2] == "Attempt 3/3 failed for download: OSError('boom')"


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
