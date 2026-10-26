"""
For production environment: Daily Timer Trigger that submits one Azure Batch job per scheduled hazard.

For staging and test environments: Manual HTTP Trigger (POST /api/pipeline-jobs).
Without a request body, it submits exactly the jobs of the daily schedule. An optional
JSON body narrows or changes the run, e.g. {"hazard_type": "floods", "mock": 1, "countries": ["KEN"]}.
See pipeline_run_request.py for the accepted fields.
This route can be set to anonymous, as Entra ID SSO is configured with Easy Auth on the Function App.
"""

import json
import logging
import os
from datetime import datetime, UTC

import azure.functions as func
from batch_client import create_batch_client, PipelineConfig, submit_pipeline_job
from pipeline_run_request import (
    InvalidPipelineRunRequest,
    parse_pipeline_run_request,
    PipelineRunRequest,
)

logger = logging.getLogger(__name__)

IBF_ENVIRONMENT = os.environ.get("IBF_ENVIRONMENT")

CONFIG_DIRECTORY = "pipelines/infra/configs"
# One Batch job is created per scheduled hazard. Only floods is scheduled for
# the prototype; add drought and tropicalCyclone once they are ready.
SCHEDULED_HAZARD_TYPES = ("floods",)

# Values of RunOrigin in pipelines/infra/data_types/data_config_types.py.
SCHEDULED_RUN_ORIGIN = "scheduled"
MANUAL_RUN_ORIGIN = "manual"

app = func.FunctionApp()


def schedule_pipeline_jobs(
    run_request: PipelineRunRequest, run_origin: str
) -> list[str]:
    run_started_at = datetime.now(UTC)
    batch_client = create_batch_client()
    job_ids: list[str] = []

    for pipeline_config in build_pipeline_configs(run_request):
        job_id = submit_pipeline_job(
            batch_client, pipeline_config, run_started_at, run_origin
        )
        logger.info(
            "Submitted Batch job '%s' for hazard '%s' (origin: %s, mock: %s, countries: %s).",
            job_id,
            pipeline_config.hazard_type,
            run_origin,
            pipeline_config.mock,
            ",".join(pipeline_config.countries) or "all",
        )
        job_ids.append(job_id)

    return job_ids


def build_pipeline_configs(
    run_request: PipelineRunRequest,
) -> tuple[PipelineConfig, ...]:
    hazard_types = (
        (run_request.hazard_type,)
        if run_request.hazard_type
        else SCHEDULED_HAZARD_TYPES
    )
    return tuple(
        PipelineConfig(
            hazard_type=hazard_type,
            config_path=f"{CONFIG_DIRECTORY}/{hazard_type}.yaml",
            mock=run_request.mock,
            countries=run_request.countries,
        )
        for hazard_type in hazard_types
    )


if IBF_ENVIRONMENT == "production":

    @app.function_name("daily_pipeline_scheduler")
    @app.timer_trigger(schedule="0 0 12 * * *", arg_name="timer", run_on_startup=False)
    def daily_pipeline_scheduler(timer: func.TimerRequest) -> None:
        logger.info(
            "Pipeline scheduler fired at %s, Time past schedule: %s.",
            datetime.now(UTC).isoformat(),
            timer.past_due,
        )
        schedule_pipeline_jobs(PipelineRunRequest(), SCHEDULED_RUN_ORIGIN)

elif IBF_ENVIRONMENT in ["test", "staging"]:

    @app.function_name("manual_pipeline_scheduler")
    @app.route(
        route="pipeline-jobs",
        trigger_arg_name="request",
        methods=["POST"],
        auth_level=func.AuthLevel.ANONYMOUS,
    )
    def manual_pipeline_scheduler(request: func.HttpRequest) -> func.HttpResponse:
        try:
            run_request = parse_pipeline_run_request(request.get_body())
        except InvalidPipelineRunRequest as error:
            return json_response({"error": str(error)}, status_code=400)

        job_ids = schedule_pipeline_jobs(run_request, MANUAL_RUN_ORIGIN)
        return json_response({"job_ids": job_ids}, status_code=201)

    def json_response(body: dict[str, object], status_code: int) -> func.HttpResponse:
        return func.HttpResponse(
            json.dumps(body), mimetype="application/json", status_code=status_code
        )

else:
    raise ValueError(f"Unsupported IBF_ENVIRONMENT: {IBF_ENVIRONMENT}")
