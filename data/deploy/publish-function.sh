#!/usr/bin/env bash
#
# publish-function.sh — Publish the Azure Function code (daily job scheduler).
#
# Deploy step. Rerun on every scheduler code change. Publishes the Python Timer
# Trigger function under function/ to the Function App deployed by deploy.sh.
# The function fires daily at 12:00 UTC and creates one Batch job per hazard.
#
# The target Function App name is owned by main.bicep. deploy.sh captures it from
# the deployment outputs into .function-app-name, which this script reads so the
# two never drift. Override with the FUNCTION_APP_NAME environment variable if you
# need to target a different app (e.g. a manual redeploy).
#
# Prerequisites:
#   - deploy.sh has been run (so .function-app-name exists), or FUNCTION_APP_NAME
#     is set explicitly.
#   - Azure CLI logged in (`az login`) with rights on the Function App.
#   - Azure Functions Core Tools (`func`) installed.
#
# Usage:
#   ./publish-function.sh
#   FUNCTION_APP_NAME=<app-name> ./publish-function.sh

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
FUNCTION_DIR="${SCRIPT_DIR}/function"
FUNCTION_APP_NAME_FILE="${SCRIPT_DIR}/.function-app-name"

if [[ ! -d "${FUNCTION_DIR}" ]]; then
  echo "Function directory not found: ${FUNCTION_DIR}" >&2
  exit 1
fi

if [[ -z "${FUNCTION_APP_NAME:-}" ]]; then
  if [[ ! -f "${FUNCTION_APP_NAME_FILE}" ]]; then
    echo "No Function App name available: set FUNCTION_APP_NAME or run deploy.sh first to create '${FUNCTION_APP_NAME_FILE}'." >&2
    exit 1
  fi
  FUNCTION_APP_NAME="$(tr -d '[:space:]' < "${FUNCTION_APP_NAME_FILE}")"
fi

if [[ -z "${FUNCTION_APP_NAME}" ]]; then
  echo "Function App name is empty; check '${FUNCTION_APP_NAME_FILE}' or set FUNCTION_APP_NAME." >&2
  exit 1
fi

echo "Publishing function code from '${FUNCTION_DIR}' to Function App '${FUNCTION_APP_NAME}'."

(
  cd "${FUNCTION_DIR}"
  func azure functionapp publish "${FUNCTION_APP_NAME}" --python
)

echo "Done. Function code published to '${FUNCTION_APP_NAME}'."
