#!/usr/bin/env bash
#
# set-secrets.sh — Store pipeline secrets in the nrw-batch-poc Key Vault.
#
# One-time setup script. Rerun only on secret rotation.
# Values are read from the local data/.env file and pushed to Key Vault for these vars
#    "IBF_PIPELINE_API_KEY"
#    "GLOFAS_FTP_USER"
#    "GLOFAS_FTP_PASSWORD"
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with an identity that has the
#     "Key Vault Secrets Officer" role on the nrw-batch-poc vault.
#   - In data/.env populated with IBF_PIPELINE_API_KEY, GLOFAS_FTP_USER and
#     GLOFAS_FTP_PASSWORD.
#
# Usage:
#   ./set-secrets.sh

set -euo pipefail

KEY_VAULT_NAME="nrw-batch-poc"
ENV_FILE="$(dirname "$0")/../.env"

# Key Vault secret name -> .env variable name.
declare -a SECRET_NAMES=(
  "ibf-pipeline-api-key"
  "glofas-ftp-user"
  "glofas-ftp-password"
)
declare -a ENV_VAR_NAMES=(
  "IBF_PIPELINE_API_KEY"
  "GLOFAS_FTP_USER"
  "GLOFAS_FTP_PASSWORD"
)

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
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

echo "Storing pipeline secrets in Key Vault '${KEY_VAULT_NAME}' from '${ENV_FILE}'."
echo

for index in "${!SECRET_NAMES[@]}"; do
  secret_name="${SECRET_NAMES[$index]}"
  env_var_name="${ENV_VAR_NAMES[$index]}"

  if ! secret_value="$(read_env_var "${env_var_name}")" || [[ -z "${secret_value}" ]]; then
    echo "No value for '${env_var_name}' in ${ENV_FILE}, skipping '${secret_name}'."
    continue
  fi

  az keyvault secret set \
    --vault-name "${KEY_VAULT_NAME}" \
    --name "${secret_name}" \
    --value "${secret_value}" \
    --output none

  echo "Set '${secret_name}'."
  unset secret_value
done

echo
echo "Done. All available secrets stored in '${KEY_VAULT_NAME}'."
