#!/usr/bin/env bash
#
# deploy.sh — Deploy the Function App and monitoring via Bicep.
#
# Deploy step. Rerun on every infra change. Bicep deploys the Function App
# (Consumption plan, managed identity), Application Insights, and the
# TaskFailEvent Azure Monitor alert against the already-provisioned Batch account
# and pool. It does NOT recreate the Batch account or pool.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights to deploy to the
#     nrw-batch-poc resource group.
#   - data/.env populated with IBF_API_URL (the NRW backend base URL, no /api).
#
# Usage:
#   ./deploy.sh

set -euo pipefail

RESOURCE_GROUP="nrw-batch-poc"
DEPLOYMENT_NAME="nrw-batch-infra"
SCRIPT_DIR="$(dirname "$0")"
TEMPLATE_FILE="${SCRIPT_DIR}/main.bicep"
PARAMETERS_FILE="${SCRIPT_DIR}/parameters.dev.json"
ENV_FILE="${SCRIPT_DIR}/../.env"
# Function App name is owned by main.bicep and captured here so publish-function.sh
# always targets exactly the app that was deployed.
FUNCTION_APP_NAME_FILE="${SCRIPT_DIR}/.function-app-name"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Bicep template not found: ${TEMPLATE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${PARAMETERS_FILE}" ]]; then
  echo "Parameters file not found: ${PARAMETERS_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file not found: ${ENV_FILE}" >&2
  exit 1
fi

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

if ! ibf_api_url="$(read_env_var "IBF_API_URL")" || [[ -z "${ibf_api_url}" ]]; then
  echo "IBF_API_URL not found in ${ENV_FILE}." >&2
  exit 1
fi

echo "Deploying Bicep template '${TEMPLATE_FILE}' to resource group '${RESOURCE_GROUP}'."

az deployment group create \
  --name "${DEPLOYMENT_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${TEMPLATE_FILE}" \
  --parameters "@${PARAMETERS_FILE}" \
  --parameters ibfApiUrl="${ibf_api_url}" \
  --output none

echo "Capturing deployed Function App name from the '${DEPLOYMENT_NAME}' deployment outputs."
function_app_name="$(az deployment group show \
  --name "${DEPLOYMENT_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query "properties.outputs.functionAppName.value" \
  --output tsv)"

if [[ -z "${function_app_name}" ]]; then
  echo "Deployment did not return a 'functionAppName' output; main.bicep must define it." >&2
  exit 1
fi

printf '%s\n' "${function_app_name}" > "${FUNCTION_APP_NAME_FILE}"

echo "Done. Deployed Function App '${function_app_name}' (name saved to '${FUNCTION_APP_NAME_FILE}')."
