#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIRECTORY="$(mktemp -d)"
trap 'rm -rf "${TEST_DIRECTORY}"' EXIT

# Arrange
mkdir -p "${TEST_DIRECTORY}/pipelines/deploy/function" "${TEST_DIRECTORY}/bin"
cp "${SCRIPT_DIR}/../../deploy/function/run_pipeline_job.sh" "${TEST_DIRECTORY}/pipelines/deploy/function/"
export AZURE_CALLS="${TEST_DIRECTORY}/azure-calls"
cat >"${TEST_DIRECTORY}/bin/az" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${AZURE_CALLS}"
case "$1" in
  version) printf '2.86.0\n' ;;
  account) exit "${TOKEN_STATUS:-0}" ;;
  login | rest) ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "${TEST_DIRECTORY}/bin/az"
export PATH="${TEST_DIRECTORY}/bin:${PATH}"
unset NRW_ENTRA_TENANT_ID NRW_SUBSCRIPTION_ID NRW_SCHEDULER_TEST_CLIENT_ID NRW_SCHEDULER_STAGING_CLIENT_ID
SETTING_NAMES=(NRW_ENTRA_TENANT_ID NRW_SUBSCRIPTION_ID NRW_SCHEDULER_TEST_CLIENT_ID)
VALID_ID="12345678-1234-1234-1234-123456789abc"
SCRIPT="${TEST_DIRECTORY}/pipelines/deploy/function/run_pipeline_job.sh"
ENV_FILE="${TEST_DIRECTORY}/.env"

assert_invalid_setting() {
  local name="$1" value="$2" message="$3" environment="${4:-test}"
  local setting_name output
  # Arrange
  : >"${ENV_FILE}"
  : >"${AZURE_CALLS}"
  for setting_name in "${SETTING_NAMES[@]}"; do
    if [[ "${setting_name}" == "${name}" ]]; then
      [[ "${value}" == missing ]] || printf '%s="%s"\n' "${name}" "${value}" >>"${ENV_FILE}"
    else
      printf '%s="%s"\n' "${setting_name}" "${VALID_ID}" >>"${ENV_FILE}"
    fi
  done

  # Act
  if output="$(bash "${SCRIPT}" --environment "${environment}" 2>&1)"; then
    echo "Expected failure for ${name} (${value})." >&2
    exit 1
  fi

  # Assert
  [[ "${output}" == *"Setting '${name}' ${message}"* ]]
  [[ "${output}" == *"${ENV_FILE}"* ]]
  [[ "${output}" == *"export it in your shell"* ]]
  [[ ! -s "${AZURE_CALLS}" ]]
}

for setting_name in "${SETTING_NAMES[@]}"; do
  assert_invalid_setting "${setting_name}" missing "is not set."
  assert_invalid_setting "${setting_name}" "" "is not set."
  assert_invalid_setting "${setting_name}" "<fill-in>" "must be a UUID"
  assert_invalid_setting "${setting_name}" "   " "must be a UUID"
  assert_invalid_setting "${setting_name}" "invalid-id" "must be a UUID"
done

SETTING_NAMES=(NRW_ENTRA_TENANT_ID NRW_SUBSCRIPTION_ID NRW_SCHEDULER_STAGING_CLIENT_ID)
assert_invalid_setting NRW_SCHEDULER_STAGING_CLIENT_ID missing "is not set." staging
assert_invalid_setting NRW_SCHEDULER_STAGING_CLIENT_ID "<fill-in>" "must be a UUID" staging

# Arrange
rm "${ENV_FILE}"
: >"${AZURE_CALLS}"

# Act
if output="$(bash "${SCRIPT}" 2>&1)"; then
  echo "Expected failure without an environment file or shell settings." >&2
  exit 1
fi

# Assert
[[ "${output}" == *"Setting 'NRW_ENTRA_TENANT_ID' is not set."* ]]
[[ ! -s "${AZURE_CALLS}" ]]

# Arrange
printf "NRW_ENTRA_TENANT_ID='%s'\nNRW_SUBSCRIPTION_ID=\"%s\"\nNRW_SCHEDULER_TEST_CLIENT_ID=%s\n" \
  "${VALID_ID}" "${VALID_ID}" "${VALID_ID}" >"${ENV_FILE}"
: >"${AZURE_CALLS}"

# Act
output="$(bash "${SCRIPT}")"

# Assert
[[ "${output}" == *"Batch job(s) submitted."* ]]
grep -Fq -- "--tenant ${VALID_ID} --resource api://${VALID_ID}" "${AZURE_CALLS}"
grep -Fq -- '--body {}' "${AZURE_CALLS}"
! grep -q '^login ' "${AZURE_CALLS}"

# Arrange
export NRW_ENTRA_TENANT_ID="ABCDEF12-1234-1234-1234-123456789ABC"
export NRW_SUBSCRIPTION_ID="${VALID_ID}"
export NRW_SCHEDULER_STAGING_CLIENT_ID="${VALID_ID}"
export TOKEN_STATUS=1
printf 'NRW_ENTRA_TENANT_ID="<fill-in>"\n' >"${ENV_FILE}"
: >"${AZURE_CALLS}"

# Act
output="$(bash "${SCRIPT}" --environment staging --hazard-type floods --mock 1 --country KEN,ETH)"

# Assert
[[ "${output}" == *"Batch job(s) submitted."* ]]
grep -Fq -- "login --tenant ${NRW_ENTRA_TENANT_ID} --subscription ${VALID_ID}" "${AZURE_CALLS}"
grep -Fq -- 'https://nrw-batch-scheduler-staging.azurewebsites.net/api/pipeline-jobs' "${AZURE_CALLS}"
grep -Fq -- '--body {"hazard_type": "floods", "mock": 1, "countries": ["KEN", "ETH"]}' "${AZURE_CALLS}"

echo "All pipeline job script tests passed."
