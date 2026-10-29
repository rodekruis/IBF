from __future__ import annotations

import logging
import time
from collections.abc import Callable
from functools import wraps
from typing import ParamSpec, TypeVar

from pipelines.infra.utils.nrw_logger import log_warning, LogTag

logger = logging.getLogger(__name__)

Parameters = ParamSpec("Parameters")
Result = TypeVar("Result")


def retry(
    *,
    max_attempts: int,
    backoff_seconds: float,
    exceptions: tuple[type[Exception], ...],
    on_retry: Callable[[int, Exception], None] | None = None,
    description: str | None = None,
) -> Callable[[Callable[Parameters, Result]], Callable[Parameters, Result]]:
    """Retry a function with linear backoff: attempt n waits backoff_seconds * n.

    on_retry is invoked before each retry with the attempt number and the
    exception, e.g. to rebuild a dead connection. Raises ConnectionError when
    all attempts are exhausted.
    """

    def decorator(
        function: Callable[Parameters, Result],
    ) -> Callable[Parameters, Result]:
        label = description or getattr(function, "__qualname__", None) or "operation"

        @wraps(function)
        def wrapper(*args: Parameters.args, **kwargs: Parameters.kwargs) -> Result:
            for attempt in range(1, max_attempts + 1):
                try:
                    return function(*args, **kwargs)
                except exceptions as exc:
                    if attempt == max_attempts:
                        raise ConnectionError(
                            f"Failed to {label} after {max_attempts} attempts"
                        ) from exc
                    log_warning(
                        logger,
                        LogTag.INFRA,
                        f"Attempt {attempt}/{max_attempts} failed for {label}: {exc!r}",
                    )
                    if on_retry is not None:
                        on_retry(attempt, exc)
                    time.sleep(backoff_seconds * attempt)
            raise AssertionError("retry loop exited unexpectedly")

        return wrapper

    return decorator
