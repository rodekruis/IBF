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
  # Strip CR first: a CRLF .env leaves '\r' after the closing quote, which
  # would otherwise survive quote stripping and poison the stored secret.
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

echo "Storing pipeline secrets in Key Vault '${KEY_VAULT_NAME}' from '${ENV_FILE}'."
echo

# All secrets are required by the Function App's Key Vault references, so
# validate every value before writing any: a partial update would leave the
# vault in a mixed state while this script reports success.
declare -a SECRET_VALUES=()
missing_vars=()

for index in "${!SECRET_NAMES[@]}"; do
  env_var_name="${ENV_VAR_NAMES[$index]}"

  if ! secret_value="$(read_env_var "${env_var_name}")" || [[ -z "${secret_value}" ]]; then
    missing_vars+=("${env_var_name}")
    SECRET_VALUES+=("")
    continue
  fi

  SECRET_VALUES+=("${secret_value}")
  unset secret_value
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo "Missing values in ${ENV_FILE} for: ${missing_vars[*]}" >&2
  echo "All secrets are required; no secrets were written." >&2
  exit 1
fi

for index in "${!SECRET_NAMES[@]}"; do
  secret_name="${SECRET_NAMES[$index]}"

  az keyvault secret set \
    --vault-name "${KEY_VAULT_NAME}" \
    --name "${secret_name}" \
    --value "${SECRET_VALUES[$index]}" \
    --output none

  echo "Set '${secret_name}'."
done

unset SECRET_VALUES

echo
echo "Done. All secrets stored in '${KEY_VAULT_NAME}'."
