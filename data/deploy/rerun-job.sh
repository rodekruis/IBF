#!/usr/bin/env bash
#
# rerun-job.sh — Manually rerun a single pipeline Batch job.
#
# Helper job, run on demand — not part of the normal deploy flow. Reads the
# pipeline secrets from the nrw-batch-poc Key Vault (never from the command
# line) and submits one Batch job for the chosen hazard via
# function/rerun_job.py, which reuses function/batch_client.py so reruns stay
# identical to the scheduled daily runs.
#
# Auth: the Batch account is AAD-only, so the job is submitted as the
# operator's own `az login` identity. That operator needs
# "Azure Batch Job Submitter" on nrwbatchpoc and "Key Vault Secrets User" on
# the nrw-batch-poc vault (see deploy.md for the one-time grant commands; the
# scheduler UAMI's grants do not apply to a human running this script).
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with the grants listed above.
#   - uv installed (provides azure-batch/azure-identity via `uv run --with`).
#   - data/.env populated with IBF_API_URL (same source as create-local-settings.sh).
#
# Usage:
#   ./rerun-job.sh <hazard-type> [config-path]
#   ./rerun-job.sh floods
#   ./rerun-job.sh floods pipelines/infra/configs/floods.yaml

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
DATA_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${DATA_DIR}/.env"
SUBSCRIPTION_ID="57b0d17a-5429-4dbb-8366-35c928e3ed94"
KEY_VAULT_NAME="nrw-batch-poc"

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <hazard-type> [config-path]" >&2
  echo "  e.g. $0 floods" >&2
  exit 1
fi

HAZARD_TYPE="$1"
CONFIG_PATH="${2:-}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file not found: ${ENV_FILE}" >&2
  exit 1
fi

az account set --subscription "${SUBSCRIPTION_ID}"

# Read a single KEY=value from the env file, stripping surrounding quotes.
read_env_var() {
  local var_name="$1"
  local line
  line="$(grep -E "^[[:space:]]*${var_name}=" "${ENV_FILE}" | tail -n 1)"
  if [[ -z "${line}" ]]; then
    return 1
  fi
  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

# Read a secret value from Key Vault. The value is captured into a variable
# and never echoed to stdout.
read_secret() {
  az keyvault secret show \
    --vault-name "${KEY_VAULT_NAME}" \
    --name "$1" \
    --query value \
    --output tsv
}

if ! IBF_API_URL="$(read_env_var IBF_API_URL)" || [[ -z "${IBF_API_URL}" ]]; then
  echo "IBF_API_URL not found in ${ENV_FILE}." >&2
  exit 1
fi

echo "Reading pipeline secrets from Key Vault '${KEY_VAULT_NAME}'."
IBF_PIPELINE_API_KEY="$(read_secret ibf-pipeline-api-key)"
GLOFAS_FTP_USER="$(read_secret glofas-ftp-user)"
GLOFAS_FTP_PASSWORD="$(read_secret glofas-ftp-password)"

# Fixed prototype values, mirroring the Function App settings in main.bicep /
# create-local-settings.sh.
export BATCH_ACCOUNT_URL="https://nrwbatchpoc.westeurope.batch.azure.com"
export BATCH_POOL_ID="nrwbatchpoc"
export IBF_ENVIRONMENT="test"
export IBF_API_URL
export IBF_PIPELINE_API_KEY GLOFAS_FTP_USER GLOFAS_FTP_PASSWORD
export GITHUB_DATA_BASE_URL="https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main"
export GLOFAS_FTP_HOST="aux.ecmwf.int"
export DATA_CACHE_DIR="/mnt/batch/tasks/fsmounts/nrw-data-cache"

# Mirror the Function App setting from main.bicep so reruns export pipeline
# logs to the same Application Insights component as the scheduled runs.
export APPLICATIONINSIGHTS_CONNECTION_STRING="$(az monitor app-insights component show \
  --app nrw-batch-scheduler \
  --resource-group nrw-batch-poc \
  --query connectionString \
  --output tsv)"

# Force the operator's own identity: a stray AZURE_CLIENT_ID in the shell
# would make batch_client use ManagedIdentityCredential instead of
# DefaultAzureCredential.
unset AZURE_CLIENT_ID

RERUN_ARGS=("${HAZARD_TYPE}")
if [[ -n "${CONFIG_PATH}" ]]; then
  RERUN_ARGS+=(--config-path "${CONFIG_PATH}")
fi

echo "Submitting rerun job for hazard '${HAZARD_TYPE}'."
(
  cd "${DATA_DIR}"
  uv run --with "azure-batch>=15" --with azure-identity \
    python deploy/function/rerun_job.py "${RERUN_ARGS[@]}"
)

unset IBF_PIPELINE_API_KEY GLOFAS_FTP_USER GLOFAS_FTP_PASSWORD
echo "Done."
