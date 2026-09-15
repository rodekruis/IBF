#!/usr/bin/env bash
#
# mock_run_hazard_job.sh — Manually run a hazard pipeline with mock data.
#
# Helper job, run on demand
# The arguments are passed through, but they must
# include --mock or it will be rejected.
# See data/pipelines/README.md for the possible flags.
#
# Usage:
#   ./mock_run_hazard_job.sh <hazard-type> --mock N [flags]
#   ./mock_run_hazard_job.sh floods --mock 1 --country KEN

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../.."

HAS_MOCK=false
for arg in "$@"; do
  if [[ "${arg}" == "--mock" || "${arg}" == --mock=* ]]; then
    HAS_MOCK=true
    break
  fi
done

if [[ "${HAS_MOCK}" != true ]]; then
  echo "This command is only used for mock data" >&2
  exit 1
fi

# shellcheck source=hazard_job_common.sh
source "${SCRIPT_DIR}/hazard_job_common.sh"

echo "Submitting mock-data job with arguments: $*"
submit_job "$@"
echo "Done."
