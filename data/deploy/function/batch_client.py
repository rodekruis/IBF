"""Helpers to build and submit Azure Batch jobs for the NRW pipeline scheduler.

Authenticates to the Batch data plane over Entra ID (the nrwbatchpoc account is
AAD-only; shared-key auth is disabled). Deployed, the Function App's dedicated
user-assigned managed identity (nrw-batch-scheduler) is used; locally, the
operator's `az login` identity via DefaultAzureCredential.
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta

import requests
from azure.batch import BatchServiceClient
from azure.batch.models import (
    EnvironmentSetting,
    JobAddParameter,
    OnAllTasksComplete,
    PoolInformation,
    TaskAddParameter,
    TaskConstraints,
    TaskContainerSettings,
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
)


@dataclass(frozen=True)
class HazardConfig:
    """A pipeline YAML config baked into the pipeline container image."""

    hazard_type: str
    config_path: str


def submit_hazard_job(
    batch_client: BatchServiceClient,
    hazard_config: HazardConfig,
    run_started_at: datetime,
) -> str:
    """Create one Batch job with a single container task for the given hazard."""
    job_id = build_job_id(hazard_config, run_started_at)
    batch_client.job.add(
        JobAddParameter(
            id=job_id,
            pool_info=PoolInformation(pool_id=require_app_setting("BATCH_POOL_ID")),
            on_all_tasks_complete=OnAllTasksComplete.terminate_job,
        )
    )
    batch_client.task.add(job_id, build_container_task(hazard_config))
    return job_id


def create_batch_client() -> BatchServiceClient:
    """Build a Batch data-plane client authenticated over Entra ID."""
    credential = build_token_credential()
    return BatchServiceClient(
        BatchTokenCredentialAdapter(credential),
        batch_url=require_app_setting("BATCH_ACCOUNT_URL"),
    )


def build_job_id(hazard_config: HazardConfig, run_started_at: datetime) -> str:
    """Deterministic prefix plus hazard and timestamp, unique per run."""
    return f"nrw-{hazard_config.hazard_type}-{run_started_at:%Y%m%d-%H%M}"


def build_container_task(hazard_config: HazardConfig) -> TaskAddParameter:
    """Container task mirroring local invocation: `pipeline --config <path>`."""
    return TaskAddParameter(
        id=f"{hazard_config.hazard_type}-task",
        command_line=f"pipeline --config {hazard_config.config_path}",
        container_settings=TaskContainerSettings(image_name=CONTAINER_IMAGE),
        environment_settings=task_environment_settings(),
        constraints=TaskConstraints(
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


class BatchTokenCredentialAdapter:
    """Adapt an azure-identity TokenCredential to the azure-batch auth protocol.

    azure-batch (msrest-based) expects a credentials object whose
    signed_session() returns a session carrying an Authorization header.
    """

    def __init__(self, credential: TokenCredential) -> None:
        self._credential = credential

    def signed_session(
        self, session: requests.Session | None = None
    ) -> requests.Session:
        if session is None:
            session = requests.Session()
        token = self._credential.get_token(BATCH_TOKEN_SCOPE)
        session.headers["Authorization"] = f"Bearer {token.token}"
        return session
