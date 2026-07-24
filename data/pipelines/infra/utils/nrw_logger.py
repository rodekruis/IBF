import logging
from enum import StrEnum


# Log tags used to help find and compare logs in Kusto
# Add new tags as needed here with a short comment as to their use.
# Make tags as specific as needed. Kusto queries can easily be written to combine tags.
class LogTag(StrEnum):
    # Timers to know how long process take
    DOWNLOAD_TIMER = "download_timer"
    JOB_TIMER = "job_timer"
    INFRA = "infra"
    FLOOD_LOGIC = "flood_logic"
    TROPICAL_CYCLONE_LOGIC = "tropical_cyclone_logic"


def log_with_tag(
    logger: logging.Logger,
    tag: LogTag,
    message: str,
    level: int = logging.INFO,
) -> None:
    """
    Log a message prefixed with a tag for fast Kusto filtering
    If more tags or parseable fields are needed in the future,
    consider writing out the whole log string as JSON.
    """
    logger.log(level, "tag_%s %s", tag.value, message)


def log_info(logger: logging.Logger, tag: LogTag, message: str) -> None:
    log_with_tag(logger, tag, message, level=logging.INFO)


def log_warning(logger: logging.Logger, tag: LogTag, message: str) -> None:
    log_with_tag(logger, tag, message, level=logging.WARNING)


def log_error(logger: logging.Logger, tag: LogTag, message: str) -> None:
    log_with_tag(logger, tag, message, level=logging.ERROR)
