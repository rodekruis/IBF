import logging
import os
from enum import StrEnum

from pipelines.infra.data_types.data_config_types import RunOrigin


# Log tags used to help find and compare logs in Kusto
# Add new tags as needed here with a short comment as to their use.
# Make tags as specific as needed. Kusto queries can easily be written to combine tags.
class LogTag(StrEnum):
    # Timer for measuring large download times
    DOWNLOAD_TIMER = "download_timer"

    # Tag for generated alerts
    # to track creation and if it passes related thresholds
    ALERT_GENERATION = "alert_generation"

    # Until email notifications are properly set up,
    # use this tag to trigger an email notification for a forecast.
    # Removal tracked in this task:
    # https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44709
    PLACEHOLDER_EMAIL_ALERT = "placeholder_email_alert"

    # Tag related to when alert data is sent to the backend
    INFRA_SEND = "infra_send"

    # Generic tags for different sections of the code.
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
    run_origin = RunOrigin(os.environ.get("PIPELINE_RUN_ORIGIN", RunOrigin.LOCAL))
    source_target = os.environ.get("PIPELINE_SOURCE_TARGET", "unknown")
    logger.log(
        level,
        "run_origin=%s source_target=%s tag_%s %s",
        run_origin.value,
        source_target,
        tag.value,
        message,
        extra={
            "pipeline_run_origin": run_origin.value,
            "pipeline_source_target": source_target,
        },
    )


def log_info(logger: logging.Logger, tag: LogTag, message: str) -> None:
    log_with_tag(logger, tag, message, level=logging.INFO)


def log_warning(logger: logging.Logger, tag: LogTag, message: str) -> None:
    log_with_tag(logger, tag, message, level=logging.WARNING)


def log_error(logger: logging.Logger, tag: LogTag, message: str) -> None:
    log_with_tag(logger, tag, message, level=logging.ERROR)
