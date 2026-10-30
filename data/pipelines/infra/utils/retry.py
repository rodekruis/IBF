from __future__ import annotations

import logging
import time
from collections.abc import Callable
from functools import wraps

from pipelines.infra.utils.nrw_logger import log_warning, LogTag

logger = logging.getLogger(__name__)


def retry[**Parameters, Result](
    *,
    max_attempts: int,
    backoff_seconds: float,
    exceptions: tuple[type[Exception], ...],
    description: Callable[Parameters, str] | None = None,
) -> Callable[[Callable[Parameters, Result]], Callable[Parameters, Result]]:
    """Retry a function with linear backoff: attempt n waits backoff_seconds * n.

    description builds the label used in logs and errors from the call's
    arguments; defaults to the function name. Raises ConnectionError when all
    attempts are exhausted.
    """

    def decorator(
        function: Callable[Parameters, Result],
    ) -> Callable[Parameters, Result]:
        @wraps(function)
        def wrapper(*args: Parameters.args, **kwargs: Parameters.kwargs) -> Result:
            label = (
                description(*args, **kwargs)
                if description is not None
                else getattr(function, "__qualname__", "operation")
            )
            for attempt in range(1, max_attempts + 1):
                try:
                    return function(*args, **kwargs)
                except exceptions as exc:
                    failure = (
                        f"Attempt {attempt}/{max_attempts} failed for {label}: {exc!r}"
                    )
                    if attempt == max_attempts:
                        log_warning(logger, LogTag.INFRA, failure)
                        raise ConnectionError(
                            f"Failed to {label} after {max_attempts} attempts"
                        ) from exc
                    delay_seconds = backoff_seconds * attempt
                    log_warning(
                        logger,
                        LogTag.INFRA,
                        f"{failure}. Retrying in {delay_seconds:g}s",
                    )
                    time.sleep(delay_seconds)
            raise AssertionError("retry loop exited unexpectedly")

        return wrapper

    return decorator
