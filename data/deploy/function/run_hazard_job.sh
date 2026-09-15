#!/usr/bin/env bash
#
# run_hazard_job.sh — Manually kick off a hazard pipeline run for a given
# hazard.
#
# Helper job, run on demand — not part of the normal deploy flow. Submits the
# same job and parameters as a standard scheduled run of the hazard. For a
# mock-data run, use mock_run_hazard_job.sh instead.
#
# Usage:
#   ./run_hazard_job.sh <hazard-type>
#   ./run_hazard_job.sh floods

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../.."

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <hazard-type>" >&2
  echo "  e.g. $0 floods" >&2
  exit 1
fi

HAZARD_TYPE="$1"

# Reject anything outside a conservative character allowlist
if [[ ! "${HAZARD_TYPE}" =~ ^[A-Za-z_-]+$ ]]; then
  echo "Invalid hazard type '${HAZARD_TYPE}'." >&2
  exit 1
fi

# shellcheck source=hazard_job_common.sh
source "${SCRIPT_DIR}/hazard_job_common.sh"

echo "Submitting job for hazard '${HAZARD_TYPE}'."
submit_job "${HAZARD_TYPE}"
echo "Done."
