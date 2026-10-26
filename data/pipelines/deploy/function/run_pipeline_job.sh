#!/usr/bin/env bash
#
# run_pipeline_job.sh — Start a pipeline run on the deployed test or staging
# environment, through the HTTP route of its scheduler Function App.
#
# Without options, the Function App submits exactly the jobs of the daily
# schedule, with live data. The options narrow or change the run. The Batch
# jobs are submitted by the Function App itself, with its own settings and
# managed identity; this script only needs your Entra ID login.
#
# Prerequisites:
#   - Membership of the developer group assigned to the scheduler's Entra ID
#     enterprise application.
#   - Azure CLI installed. The script logs in when needed.
#   - NRW_ENTRA_TENANT_ID, NRW_SUBSCRIPTION_ID and
#     NRW_SCHEDULER_<ENVIRONMENT>_CLIENT_ID set in data/.env (see
#     data/.env.example) or in the shell environment.
#
# Usage:
#   ./run_pipeline_job.sh [--environment test|staging] [--hazard-type <hazard>]
#                         [--mock 0|1] [--country <ISO3>[,<ISO3>...]]
#   ./run_pipeline_job.sh
#   ./run_pipeline_job.sh --environment staging --hazard-type floods --mock 1 --country KEN,ETH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../../../.env"

main() {
  local environment="test"
  local hazard_type=""
  local mock=""
  local countries=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --environment) environment="$(require_option_value "$@")"; shift 2 ;;
      --hazard-type) hazard_type="$(require_option_value "$@")"; shift 2 ;;
      --mock) mock="$(require_option_value "$@")"; shift 2 ;;
      --country) countries="$(require_option_value "$@")"; shift 2 ;;
      -h | --help) print_usage; exit 0 ;;
      *) fail_with_usage "Unknown option '$1'." ;;
    esac
  done

  validate_options "${environment}" "${hazard_type}" "${mock}" "${countries}"

  local environment_upper
  environment_upper="$(printf '%s' "${environment}" | tr '[:lower:]' '[:upper:]')"
  local tenant_id subscription_id client_id
  tenant_id="$(read_setting NRW_ENTRA_TENANT_ID)"
  subscription_id="$(read_setting NRW_SUBSCRIPTION_ID)"
  client_id="$(read_setting "NRW_SCHEDULER_${environment_upper}_CLIENT_ID")"

  local url="https://nrw-batch-scheduler-${environment}.azurewebsites.net/api/pipeline-jobs"
  local request_body
  request_body="$(build_request_body "${hazard_type}" "${mock}" "${countries}")"

  echo "Starting pipeline run on '${environment}' with request ${request_body}."
  ensure_logged_in "${tenant_id}" "${client_id}"
  # --subscription pins the token to that subscription's tenant, even if
  # another tenant's subscription is the default.
  if ! az rest \
    --method post \
    --url "${url}" \
    --resource "api://${client_id}" \
    --subscription "${subscription_id}" \
    --headers "Content-Type=application/json" \
    --body "${request_body}"; then
    echo "Pipeline run was not started." >&2
    exit 1
  fi
  echo "Batch job(s) submitted. Monitor them in the Batch account or Application Insights."
}

# Logs in interactively only when no token for the scheduler can be acquired
# silently, e.g. on first use or after the refresh token expired.
ensure_logged_in() {
  local tenant_id="$1" client_id="$2"
  if az account get-access-token \
    --tenant "${tenant_id}" \
    --resource "api://${client_id}" \
    --output none 2>/dev/null; then
    return
  fi
  echo "No valid Azure CLI login for the scheduler. Logging in..."
  az login \
    --tenant "${tenant_id}" \
    --scope "api://${client_id}/user_impersonation" \
    --output none
}

print_usage() {
  sed -n '18,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

fail_with_usage() {
  echo "$1" >&2
  print_usage >&2
  exit 1
}

require_option_value() {
  if [[ $# -lt 2 || "$2" == --* ]]; then
    fail_with_usage "Option '$1' requires a value."
  fi
  printf '%s' "$2"
}

# The Function App validates the request as well; these checks fail fast and
# keep the hand-built JSON body safe.
validate_options() {
  local environment="$1" hazard_type="$2" mock="$3" countries="$4"
  if [[ "${environment}" != "test" && "${environment}" != "staging" ]]; then
    fail_with_usage "Invalid environment '${environment}'. Use 'test' or 'staging'."
  fi
  if [[ -n "${hazard_type}" && ! "${hazard_type}" =~ ^[A-Za-z]+$ ]]; then
    fail_with_usage "Invalid hazard type '${hazard_type}'."
  fi
  if [[ -n "${mock}" && ! "${mock}" =~ ^[01]$ ]]; then
    fail_with_usage "Invalid mock '${mock}'. Use 0 (no alert) or 1 (alert)."
  fi
  if [[ -n "${countries}" && ! "${countries}" =~ ^[A-Z]{3}(,[A-Z]{3})*$ ]]; then
    fail_with_usage "Invalid country '${countries}'. Use uppercase ISO 3 codes, e.g. KEN or KEN,ETH."
  fi
}

# Reads a setting from the shell environment, or else from data/.env. The file
# is parsed, not sourced, so it cannot execute code.
read_setting() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" && -f "${ENV_FILE}" ]]; then
    value="$(sed -n "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*//p" "${ENV_FILE}" | tail -n 1)"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value#\"}"; value="${value%\"}"
    value="${value#\'}"; value="${value%\'}"
  fi
  if [[ -z "${value}" ]]; then
    echo "Setting '${name}' is not set. Add it to data/.env (see data/.env.example)." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

build_request_body() {
  local hazard_type="$1" mock="$2" countries="$3"
  local fields=()
  [[ -n "${hazard_type}" ]] && fields+=("\"hazard_type\": \"${hazard_type}\"")
  [[ -n "${mock}" ]] && fields+=("\"mock\": ${mock}")
  [[ -n "${countries}" ]] && fields+=("\"countries\": [\"${countries//,/\", \"}\"]")
  local joined=""
  if [[ ${#fields[@]} -gt 0 ]]; then
    joined="$(printf ', %s' "${fields[@]}")"
    joined="${joined:2}"
  fi
  printf '{%s}' "${joined}"
}

main "$@"
