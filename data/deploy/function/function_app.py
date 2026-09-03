"""Daily Timer Trigger that submits one Azure Batch job per hazard pipeline.

Fires daily at set time in UTC and creates
one Batch job per entry in HAZARD_CONFIGS. Only floods is scheduled for the
prototype; drought is a dummy pipeline and tropicalCyclone is not ready yet.
"""

import logging
from datetime import datetime, timezone

import azure.functions as func
from batch_client import create_batch_client, HazardConfig, submit_hazard_job

# One Batch job is created per entry. Only floods is scheduled for the
# prototype; add drought and tropicalCyclone once they are ready.
HAZARD_CONFIGS = (
    HazardConfig(
        hazard_type="floods",
        config_path="pipelines/infra/configs/floods.yaml",
    ),
)

app = func.FunctionApp()


@app.function_name("daily_pipeline_scheduler")
@app.timer_trigger(schedule="0 0 12 * * *", arg_name="timer", run_on_startup=False)
def daily_pipeline_scheduler(timer: func.TimerRequest) -> None:
    run_started_at = datetime.now(timezone.utc)
    logging.info("Pipeline scheduler fired at %s.", run_started_at.isoformat())

    batch_client = create_batch_client()
    for hazard_config in HAZARD_CONFIGS:
        job_id = submit_hazard_job(batch_client, hazard_config, run_started_at)
        logging.info(
            "Submitted Batch job '%s' for hazard '%s'.",
            job_id,
            hazard_config.hazard_type,
        )
