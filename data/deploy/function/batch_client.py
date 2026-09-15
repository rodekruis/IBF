"""Helpers to build and submit Azure Batch jobs for the NRW pipeline scheduler.

Authenticates to the Batch data plane over Entra ID (the nrwbatchpoc account is
AAD-only; shared-key auth is disabled). Deployed, the Function App's dedicated
user-assigned managed identity (nrw-batch-scheduler) is used; locally, the
operator's `az login` identity via DefaultAzureCredential.

Targets azure-batch 15.x, the azure-core SDK generation: BatchClient takes a
standard azure-identity TokenCredential directly.
"""

import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from azure.batch import BatchClient
from azure.batch.models import (
    BatchAllTasksCompleteMode,
    BatchJobCreateOptions,
    BatchNodeIdentityReference,
    BatchPoolInfo,
    BatchTaskConstraints,
    BatchTaskContainerSettings,
    BatchTaskCreateOptions,
    ContainerWorkingDirectory,
    EnvironmentSetting,
    OutputFile,
    OutputFileBlobContainerDestination,
    OutputFileDestination,
    OutputFileUploadCondition,
    OutputFileUploadConfiguration,
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
# If passed like this, these can be read by any user with batch account permissions.
# These secrets are not very sensitive and can already be read from github by more users,
# so this is not considered an issue.
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


# HazardConfig fields are interpolated into a shell-executed Batch task
# command line, so reject anything outside a conservative allowlist of characters.
HAZARD_TYPE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
CONFIG_PATH_PATTERN = re.compile(r"^[A-Za-z0-9_./-]+$")
EXTRA_ARG_PATTERN = re.compile(r"^[A-Za-z0-9_./:,=+-]+$")


@dataclass(frozen=True)
class HazardConfig:
    """A pipeline YAML config baked into the pipeline container image.

    extra_args carries extra pipeline flags (see pipelines/infra/run_forecasts.py)
    for manual debug/test reruns; each token is validated against
    EXTRA_ARG_PATTERN and extra_args requires --mock.
    """

    hazard_type: str
    config_path: str
    extra_args: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not HAZARD_TYPE_PATTERN.fullmatch(self.hazard_type):
            raise ValueError(f"Invalid hazard type '{self.hazard_type}'.")
        if ".." in self.config_path or not CONFIG_PATH_PATTERN.fullmatch(
            self.config_path
        ):
            raise ValueError(f"Invalid config path '{self.config_path}'.")
        for extra_arg in self.extra_args:
            if not EXTRA_ARG_PATTERN.fullmatch(extra_arg):
                raise ValueError(f"Invalid extra argument '{extra_arg}'.")
        if self.extra_args and not any(
            arg == "--mock" or arg.startswith("--mock=") for arg in self.extra_args
        ):
            raise ValueError("extra_args requires --mock to be set.")


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
    batch_client.create_task(job_id, build_container_task(hazard_config, job_id))
    return job_id


def create_batch_client() -> BatchClient:
    """Build a Batch data-plane client authenticated over Entra ID."""
    return BatchClient(
        endpoint=require_app_setting("BATCH_ACCOUNT_URL"),
        credential=build_token_credential(),
    )


def build_job_id(hazard_config: HazardConfig, run_started_at: datetime) -> str:
    """Deterministic prefix plus hazard and timestamp, unique per run."""
    return f"nrw-{hazard_config.hazard_type}-{run_started_at:%Y%m%d-%H%M%S}"


def build_container_task(
    hazard_config: HazardConfig, job_id: str
) -> BatchTaskCreateOptions:
    """Container task mirroring local invocation: `pipeline --config <path>`."""
    return BatchTaskCreateOptions(
        id=f"{hazard_config.hazard_type}-task",
        command_line=build_command_line(hazard_config),
        container_settings=BatchTaskContainerSettings(
            image_name=CONTAINER_IMAGE,
            # Use the image WORKDIR (/home/pipelines/app) so the relative config
            # path resolves; Batch otherwise defaults to the task working directory.
            working_directory=ContainerWorkingDirectory.CONTAINER_IMAGE_DEFAULT,
        ),
        environment_settings=task_environment_settings(),
        constraints=BatchTaskConstraints(
            max_wall_clock_time=TASK_MAX_WALL_CLOCK_TIME,
            max_task_retry_count=TASK_MAX_RETRY_COUNT,
        ),
        output_files=task_output_files(hazard_config, job_id),
    )


def build_command_line(hazard_config: HazardConfig) -> str:
    """Render the pipeline CLI invocation, e.g. `pipeline --config <path> --mock 0 --country PHL`."""
    parts = [
        "pipeline",
        "--config",
        hazard_config.config_path,
        *hazard_config.extra_args,
    ]
    return " ".join(parts)


def task_environment_settings() -> list[EnvironmentSetting]:
    """Read the pipeline environment variables from the Function App settings."""
    return [
        EnvironmentSetting(name=name, value=require_app_setting(name))
        for name in TASK_ENVIRONMENT_VARIABLES
    ]


def task_output_files(
    hazard_config: HazardConfig, job_id: str
) -> list[OutputFile] | None:
    """Write the Batch stdout.txt/stderr.txt files to blob storage"""
    container_url = os.environ.get("BATCH_TASK_LOGS_CONTAINER_URL")
    node_identity_resource_id = os.environ.get("BATCH_POOL_NODE_IDENTITY_RESOURCE_ID")
    if not container_url or not node_identity_resource_id:
        return None
    return [
        OutputFile(
            file_pattern="../std*.txt",
            destination=OutputFileDestination(
                container=OutputFileBlobContainerDestination(
                    container_url=container_url,
                    path=f"task-logs/{hazard_config.hazard_type}/{job_id}",
                    identity_reference=BatchNodeIdentityReference(
                        resource_id=node_identity_resource_id
                    ),
                )
            ),
            upload_options=OutputFileUploadConfiguration(
                upload_condition=OutputFileUploadCondition.TASK_COMPLETION
            ),
        )
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
