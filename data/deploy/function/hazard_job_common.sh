#!/usr/bin/env bash
#
# hazard_job_common.sh — Shared setup for run_hazard_job.sh and
# mock_run_hazard_job.sh. Sourced by those scripts, not run directly.
#
# Reads the pipeline secrets from the nrw-batch-poc Key Vault (never from the
# command line) and exports the same environment the Function App provides, so
# manually submitted jobs stay identical to the scheduled daily runs.
# Submission goes through function/submit_hazard_job.py, which reuses
# function/batch_client.py.
#
# Auth: the Batch account is AAD-only, so the job is submitted as the
# operator's own `az login` identity. That operator needs
# "Azure Batch Job Submitter" on nrwbatchpoc and "Key Vault Secrets User" on
# the nrw-batch-poc vault (see data/deploy/readme-implementation.md for the
# one-time grant commands; the scheduler UAMI's grants do not apply to a human
# running these scripts).
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with the grants listed above.
#   - uv installed (provides azure-batch/azure-identity via `uv run --with`).
#   - data/.env populated with IBF_API_URL (same source as create-local-settings.sh).
#
# Expects DATA_DIR to be set by the calling script.

ENV_FILE="${DATA_DIR}/.env"
SUBSCRIPTION_ID="57b0d17a-5429-4dbb-8366-35c928e3ed94"
KEY_VAULT_NAME="nrw-batch-poc"

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
  # Strip CR first from end of line
  value="${value%$'\r'}"
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

# Mirror the Function App setting from main.bicep so submitted jobs export
# pipeline logs to the same Application Insights component as the scheduled
# runs.
export APPLICATIONINSIGHTS_CONNECTION_STRING="$(az monitor app-insights component show \
  --app nrw-batch-scheduler \
  --resource-group nrw-batch-poc \
  --query connectionString \
  --output tsv)"

# Force the operator's own identity: a stray AZURE_CLIENT_ID in the shell
# would make batch_client use ManagedIdentityCredential instead of
# DefaultAzureCredential.
unset AZURE_CLIENT_ID

# Submit one Batch job, passing the arguments through to submit_hazard_job.py.
submit_job() {
  (
    cd "${DATA_DIR}"
    uv run --with "azure-batch>=15,<16" --with azure-identity \
      python deploy/function/submit_hazard_job.py "$@"
  )
  unset IBF_PIPELINE_API_KEY GLOFAS_FTP_USER GLOFAS_FTP_PASSWORD
}
