#!/usr/bin/env bash
#
# create-local-settings.sh — Generate function/local.settings.json for local runs.
#
# Builds the gitignored local.settings.json used by `func start`, mirroring the
# deployed app settings from main.bicep. Secret values are read from data/.env
# (IBF_API_URL, IBF_PIPELINE_API_KEY, GLOFAS_FTP_USER, GLOFAS_FTP_PASSWORD); they
# are never committed because local.settings.json is gitignored.
#
# Prerequisites:
#   - data/.env populated with the four variables listed above.
#   - python3 on PATH (used only to safely write JSON).
#
# Usage:
#   ./create-local-settings.sh

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
ENV_FILE="${SCRIPT_DIR}/../../.env"
SETTINGS_FILE="${SCRIPT_DIR}/local.settings.json"

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

missing=0
for var_name in IBF_API_URL IBF_PIPELINE_API_KEY GLOFAS_FTP_USER GLOFAS_FTP_PASSWORD; do
  if ! value="$(read_env_var "${var_name}")" || [[ -z "${value}" ]]; then
    echo "${var_name} not found in ${ENV_FILE}." >&2
    missing=1
  fi
done
if [[ "${missing}" -ne 0 ]]; then
  exit 1
fi

IBF_API_URL="$(read_env_var IBF_API_URL)"
IBF_PIPELINE_API_KEY="$(read_env_var IBF_PIPELINE_API_KEY)"
GLOFAS_FTP_USER="$(read_env_var GLOFAS_FTP_USER)"
GLOFAS_FTP_PASSWORD="$(read_env_var GLOFAS_FTP_PASSWORD)"
export IBF_API_URL IBF_PIPELINE_API_KEY GLOFAS_FTP_USER GLOFAS_FTP_PASSWORD

python3 - "${SETTINGS_FILE}" <<'EOF'
import json
import os
import sys

settings = {
    "IsEncrypted": False,
    "Values": {
        "AzureWebJobsStorage": "UseDevelopmentStorage=true",
        "FUNCTIONS_WORKER_RUNTIME": "python",
        "BATCH_ACCOUNT_URL": "https://nrwbatchpoc.westeurope.batch.azure.com",
        "BATCH_POOL_ID": "nrwbatchpoc",
        "IBF_ENVIRONMENT": "test",
        "IBF_API_URL": os.environ["IBF_API_URL"],
        "IBF_PIPELINE_API_KEY": os.environ["IBF_PIPELINE_API_KEY"],
        "GITHUB_DATA_BASE_URL": "https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main",
        "GLOFAS_FTP_HOST": "aux.ecmwf.int",
        "GLOFAS_FTP_USER": os.environ["GLOFAS_FTP_USER"],
        "GLOFAS_FTP_PASSWORD": os.environ["GLOFAS_FTP_PASSWORD"],
        "DATA_CACHE_DIR": "/mnt/batch/tasks/fsmounts/nrw-data-cache",
    },
}

with open(sys.argv[1], "w", encoding="utf-8") as settings_file:
    json.dump(settings, settings_file, indent=2)
    settings_file.write("\n")
EOF

echo "Wrote ${SETTINGS_FILE} (gitignored; secrets sourced from ${ENV_FILE})."
