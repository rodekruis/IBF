#!/usr/bin/env bash
#
# pipeline_job_common.sh — Shared setup for run_pipeline_job.sh and
# mock_run_pipeline_job.sh. Sourced by those scripts, not run directly.
#
# Reads the app settings of the target environment's scheduler Function App,
# resolving Key Vault references from the vault (never from the command line),
# and exports them, so manually submitted jobs stay identical to the scheduled
# daily runs. Submission goes through function/submit_pipeline_job.py, which
# reuses function/batch_client.py.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with the grants listed in
#     readme-implementation.md.
#   - uv installed (provides azure-batch/azure-identity via `uv run --with`).
#
# Expects DATA_DIR and TARGET_ENVIRONMENT to be set by the calling script.

SUBSCRIPTION_ID="57b0d17a-5429-4dbb-8366-35c928e3ed94"
KEY_VAULT_REFERENCE_PATTERN='^@Microsoft\.KeyVault\(VaultName=([^;]+);SecretName=([^)]+)\)$'
SETTING_NAMES=(
  BATCH_ACCOUNT_URL
  BATCH_POOL_ID
  BATCH_TASK_LOGS_CONTAINER_URL
  BATCH_POOL_NODE_IDENTITY_RESOURCE_ID
  IBF_ENVIRONMENT
  IBF_API_URL
  IBF_PIPELINE_API_KEY
  GITHUB_DATA_BASE_URL
  GLOFAS_FTP_HOST
  GLOFAS_FTP_USER
  GLOFAS_FTP_PASSWORD
  DATA_CACHE_DIR
  APPLICATIONINSIGHTS_CONNECTION_STRING
)

# TODO: remove 'poc' once those resources are removed.
case "${TARGET_ENVIRONMENT}" in
  poc)
    FUNCTION_APP_NAME="nrw-batch-scheduler"
    RESOURCE_GROUP="nrw-batch-poc"
    ;;
  test | staging | prod)
    FUNCTION_APP_NAME="nrw-batch-scheduler-${TARGET_ENVIRONMENT}"
    RESOURCE_GROUP="NRW"
    ;;
  *)
    echo "Invalid environment '${TARGET_ENVIRONMENT}'. Use one of: poc, test, staging, prod." >&2
    exit 1
    ;;
esac

az account set --subscription "${SUBSCRIPTION_ID}"

# The value is captured into a variable by the caller and never echoed to stdout.
resolve_setting_value() {
  local setting_value="$1"
  if [[ "${setting_value}" =~ ${KEY_VAULT_REFERENCE_PATTERN} ]]; then
    az keyvault secret show \
      --vault-name "${BASH_REMATCH[1]}" \
      --name "${BASH_REMATCH[2]}" \
      --query value \
      --output tsv
  else
    printf '%s' "${setting_value}"
  fi
}

echo "Reading app settings of Function App '${FUNCTION_APP_NAME}' and resolving its Key Vault references."
setting_names_json="$(printf '"%s",' "${SETTING_NAMES[@]}")"
app_settings="$(az functionapp config appsettings list \
  --name "${FUNCTION_APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "[?contains(\`[${setting_names_json%,}]\`, name)].[name, value]" \
  --output tsv)"

for setting_name in "${SETTING_NAMES[@]}"; do
  setting_value="$(awk -F '\t' -v name="${setting_name}" '$1 == name { print $2 }' <<< "${app_settings}")"
  if [[ -z "${setting_value}" ]]; then
    echo "App setting '${setting_name}' not found on Function App '${FUNCTION_APP_NAME}'." >&2
    exit 1
  fi
  resolved_value="$(resolve_setting_value "${setting_value}")"
  export "${setting_name}=${resolved_value}"
done
unset app_settings setting_value resolved_value

export PIPELINE_RUN_ORIGIN="manual"

# Force the operator's own identity: a stray AZURE_CLIENT_ID in the shell
# would make batch_client use ManagedIdentityCredential instead of
# DefaultAzureCredential.
unset AZURE_CLIENT_ID

# Submit one Batch job, passing the arguments through to submit_pipeline_job.py.
submit_job() {
  (
    cd "${DATA_DIR}"
    uv run --with "azure-batch>=15,<16" --with azure-identity \
      python pipelines/deploy/function/submit_pipeline_job.py "$@"
  )
  unset IBF_PIPELINE_API_KEY GLOFAS_FTP_USER GLOFAS_FTP_PASSWORD
}
