"""Daily Timer Trigger that submits one Azure Batch job per hazard pipeline.

Fires daily at set time in UTC and creates
one Batch job per entry in PIPELINE_CONFIGS. Only floods is scheduled for the
prototype; drought is a dummy pipeline and tropicalCyclone is not ready yet.
"""

import logging
from datetime import datetime, UTC

import azure.functions as func
from batch_client import create_batch_client, PipelineConfig, submit_pipeline_job

logger = logging.getLogger(__name__)

# One Batch job is created per entry. Only floods is scheduled for the
# prototype; add drought and tropicalCyclone once they are ready.
PIPELINE_CONFIGS = (
    PipelineConfig(
        hazard_type="floods",
        config_path="pipelines/infra/configs/floods.yaml",
    ),
)

app = func.FunctionApp()


@app.function_name("daily_pipeline_scheduler")
@app.timer_trigger(schedule="0 0 12 * * *", arg_name="timer", run_on_startup=False)
def daily_pipeline_scheduler(timer: func.TimerRequest) -> None:
    run_started_at = datetime.now(UTC)
    logger.info(
        "Pipeline scheduler fired at %s, Time past schedule: %s.",
        run_started_at.isoformat(),
        timer.past_due,
    )

    batch_client = create_batch_client()
    for pipeline_config in PIPELINE_CONFIGS:
        job_id = submit_pipeline_job(batch_client, pipeline_config, run_started_at)
        logger.info(
            "Submitted Batch job '%s' for hazard '%s'.",
            job_id,
            pipeline_config.hazard_type,
        )
