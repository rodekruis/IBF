"""Helpers to build and submit Azure Batch jobs for the NRW pipeline scheduler.

Authenticates to the Batch data plane over Entra ID (the nrwbatchpoc account is
AAD-only; shared-key auth is disabled). Deployed, the Function App's dedicated
user-assigned managed identity (nrw-batch-scheduler) is used; locally, the
operator's `az login` identity via DefaultAzureCredential.

Targets azure-batch 15.x, the azure-core SDK generation: BatchClient takes a
standard azure-identity TokenCredential directly.
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta

from azure.batch import BatchClient
from azure.batch.models import (
    BatchAllTasksCompleteMode,
    BatchJobCreateOptions,
    BatchPoolInfo,
    BatchTaskConstraints,
    BatchTaskContainerSettings,
    BatchTaskCreateOptions,
    EnvironmentSetting,
)
from azure.core.credentials import TokenCredential
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential

BATCH_TOKEN_SCOPE = "https://batch.core.windows.net/.default"
CONTAINER_IMAGE = "nrwdockerregistry.azurecr.io/pipelines:latest"
TASK_MAX_WALL_CLOCK_TIME = timedelta(hours=10)
TASK_MAX_RETRY_COUNT = 0

# Environment variables forwarded from the Function App settings onto each Batch
# task. Secret values arrive as Key Vault references on the app settings, so the
# resolved values are read from os.environ here.
TASK_ENVIRONMENT_VARIABLES = (
    "IBF_ENVIRONMENT",
    "IBF_API_URL",
    "IBF_PIPELINE_API_KEY",
    "GITHUB_DATA_BASE_URL",
    "GLOFAS_FTP_HOST",
    "GLOFAS_FTP_USER",
    "GLOFAS_FTP_PASSWORD",
    "DATA_CACHE_DIR",
    # Set by main.bicep on the Function App; enables pipeline log export to
    # Application Insights inside the Batch task containers.
    "APPLICATIONINSIGHTS_CONNECTION_STRING",
)


@dataclass(frozen=True)
class HazardConfig:
    """A pipeline YAML config baked into the pipeline container image."""

    hazard_type: str
    config_path: str


def submit_hazard_job(
    batch_client: BatchClient,
    hazard_config: HazardConfig,
    run_started_at: datetime,
) -> str:
    """Create one Batch job with a single container task for the given hazard."""
    job_id = build_job_id(hazard_config, run_started_at)
    batch_client.create_job(
        BatchJobCreateOptions(
            id=job_id,
            pool_info=BatchPoolInfo(pool_id=require_app_setting("BATCH_POOL_ID")),
            all_tasks_complete_mode=BatchAllTasksCompleteMode.TERMINATE_JOB,
        )
    )
    batch_client.create_task(job_id, build_container_task(hazard_config))
    return job_id


def create_batch_client() -> BatchClient:
    """Build a Batch data-plane client authenticated over Entra ID."""
    return BatchClient(
        endpoint=require_app_setting("BATCH_ACCOUNT_URL"),
        credential=build_token_credential(),
    )


def build_job_id(hazard_config: HazardConfig, run_started_at: datetime) -> str:
    """Deterministic prefix plus hazard and timestamp, unique per run."""
    return f"nrw-{hazard_config.hazard_type}-{run_started_at:%Y%m%d-%H%M}"


def build_container_task(hazard_config: HazardConfig) -> BatchTaskCreateOptions:
    """Container task mirroring local invocation: `pipeline --config <path>`."""
    return BatchTaskCreateOptions(
        id=f"{hazard_config.hazard_type}-task",
        command_line=f"pipeline --config {hazard_config.config_path}",
        container_settings=BatchTaskContainerSettings(image_name=CONTAINER_IMAGE),
        environment_settings=task_environment_settings(),
        constraints=BatchTaskConstraints(
            max_wall_clock_time=TASK_MAX_WALL_CLOCK_TIME,
            max_task_retry_count=TASK_MAX_RETRY_COUNT,
        ),
    )


def task_environment_settings() -> list[EnvironmentSetting]:
    """Read the pipeline environment variables from the Function App settings."""
    return [
        EnvironmentSetting(name=name, value=require_app_setting(name))
        for name in TASK_ENVIRONMENT_VARIABLES
    ]


def build_token_credential() -> TokenCredential:
    """Managed identity when deployed; the operator's login identity locally."""
    managed_identity_client_id = os.environ.get("AZURE_CLIENT_ID")
    if managed_identity_client_id:
        return ManagedIdentityCredential(client_id=managed_identity_client_id)
    return DefaultAzureCredential()


def require_app_setting(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Required app setting '{name}' is not set.")
    return value
