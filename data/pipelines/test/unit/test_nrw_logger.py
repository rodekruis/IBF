import logging
from unittest.mock import patch

from pipelines.infra.utils.nrw_logger import log_info, LogTag


def test_log_includes_pipeline_provenance() -> None:
    logger = logging.getLogger("test_nrw_logger")

    with patch.dict(
        "os.environ",
        {"PIPELINE_RUN_ORIGIN": "scheduled", "PIPELINE_SOURCE_TARGET": "live"},
    ), patch.object(logger, "log") as log:
        log_info(logger, LogTag.INFRA, "pipeline started")

    log.assert_called_once_with(
        logging.INFO,
        "run_origin=%s source_target=%s tag_%s %s",
        "scheduled",
        "live",
        "infra",
        "pipeline started",
        extra={
            "pipeline_run_origin": "scheduled",
            "pipeline_source_target": "live",
        },
    )


def test_log_defaults_to_local_source() -> None:
    logger = logging.getLogger("test_nrw_logger")

    with patch.dict("os.environ", {}, clear=True), patch.object(logger, "log") as log:
        log_info(logger, LogTag.INFRA, "pipeline started")

    assert log.call_args.kwargs["extra"] == {
        "pipeline_run_origin": "local",
        "pipeline_source_target": "unknown",
    }
