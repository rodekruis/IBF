#!/usr/bin/env bash
#
# run_pipeline_job.sh — Manually kick off a hazard pipeline run for a given
# hazard.
#
# Helper job, run on demand — not part of the normal deploy flow. Submits the
# same job and parameters as a standard scheduled run of the hazard. For a
# mock-data run, use mock_run_pipeline_job.sh instead.
#
# Usage:
#   ./run_pipeline_job.sh <environment> <hazard-type>
#   ./run_pipeline_job.sh test floods

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../../.."

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <environment> <hazard-type>" >&2
  echo "  e.g. $0 test floods" >&2
  exit 1
fi

TARGET_ENVIRONMENT="$1"
HAZARD_TYPE="$2"

# Reject anything outside a conservative character allowlist
if [[ ! "${HAZARD_TYPE}" =~ ^[A-Za-z_-]+$ ]]; then
  echo "Invalid hazard type '${HAZARD_TYPE}'." >&2
  exit 1
fi

# shellcheck source=pipeline_job_common.sh
source "${SCRIPT_DIR}/pipeline_job_common.sh"

echo "Submitting job for hazard '${HAZARD_TYPE}' to environment '${TARGET_ENVIRONMENT}'."
submit_job "${HAZARD_TYPE}"
echo "Done."
