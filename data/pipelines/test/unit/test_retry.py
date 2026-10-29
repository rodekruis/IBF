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
        description="download 'file.nc'",
    )(function)

    # Act & Assert
    with (
        patch(f"{RETRY_MODULE}.time.sleep"),
        pytest.raises(ConnectionError, match="download 'file.nc' after 3 attempts"),
    ):
        decorated()


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


def test_retry_invokes_on_retry_before_each_retry() -> None:
    # Arrange
    function = MagicMock(side_effect=[OSError("first"), OSError("second"), "result"])
    on_retry = MagicMock()
    decorated = retry(
        max_attempts=3,
        backoff_seconds=5,
        exceptions=(OSError,),
        on_retry=on_retry,
    )(function)

    # Act
    with patch(f"{RETRY_MODULE}.time.sleep"):
        result = decorated()

    # Assert
    assert result == "result"
    assert on_retry.call_count == 2
    assert on_retry.call_args_list[0].args[0] == 1
    assert isinstance(on_retry.call_args_list[0].args[1], OSError)
    assert on_retry.call_args_list[1].args[0] == 2


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
