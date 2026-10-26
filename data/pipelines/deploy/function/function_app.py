"""
For production environment: Daily Timer Trigger that submits one Azure Batch job per hazard pipeline.

Fires daily at set time in UTC and creates
one Batch job per entry in PIPELINE_CONFIGS.

For staging and test environments: Manual HTTP Trigger that executes the schedule immediately.
This route can be set to anonymous, as Entra ID SSO is configured with Easy Auth on the Function App.
"""

import json
import logging
import os
from datetime import datetime, UTC

import azure.functions as func
from batch_client import create_batch_client, PipelineConfig, submit_pipeline_job

logger = logging.getLogger(__name__)

IBF_ENVIRONMENT = os.environ.get("IBF_ENVIRONMENT")

# One Batch job is created per entry. Only floods is scheduled for the
# prototype; add drought and tropicalCyclone once they are ready.
PIPELINE_CONFIGS = (
    PipelineConfig(
        hazard_type="floods",
        config_path="pipelines/infra/configs/floods.yaml",
    ),
)

app = func.FunctionApp()


def schedule_pipeline_jobs() -> list[str]:
    run_started_at = datetime.now(UTC)
    batch_client = create_batch_client()
    job_ids: list[str] = []

    for pipeline_config in PIPELINE_CONFIGS:
        job_id = submit_pipeline_job(batch_client, pipeline_config, run_started_at)
        logger.info(
            "Submitted Batch job '%s' for hazard '%s'.",
            job_id,
            pipeline_config.hazard_type,
        )
        job_ids.append(job_id)

    return job_ids


if IBF_ENVIRONMENT == "production":

    @app.function_name("daily_pipeline_scheduler")
    @app.timer_trigger(schedule="0 0 12 * * *", arg_name="timer", run_on_startup=False)
    def daily_pipeline_scheduler(timer: func.TimerRequest) -> None:
        run_started_at = datetime.now(UTC)
        logger.info(
            "Pipeline scheduler fired at %s, Time past schedule: %s.",
            run_started_at.isoformat(),
            timer.past_due,
        )
        schedule_pipeline_jobs()

elif IBF_ENVIRONMENT in ["test", "staging"]:

    @app.function_name("manual_pipeline_scheduler")
    @app.route(
        route="pipeline-jobs",
        trigger_arg_name="_request",
        methods=["POST"],
        auth_level=func.AuthLevel.ANONYMOUS,
    )
    def manual_pipeline_scheduler(_request: func.HttpRequest) -> func.HttpResponse:
        job_ids = schedule_pipeline_jobs()
        return func.HttpResponse(
            json.dumps({"job_ids": job_ids}),
            mimetype="application/json",
            status_code=201,
        )

else:
    raise ValueError(f"Unsupported IBF_ENVIRONMENT: {IBF_ENVIRONMENT}")
