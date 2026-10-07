#!/usr/bin/env bash
#
# mock_run_pipeline_job.sh — Manually run a hazard pipeline with mock data.
#
# Helper job, run on demand
# The arguments are passed through, but they must
# include --mock or it will be rejected.
# See data/pipelines/README.md for the possible flags.
#
# Usage:
#   ./mock_run_pipeline_job.sh <environment> <hazard-type> --mock N [flags]
#   ./mock_run_pipeline_job.sh test floods --mock 1 --country KEN

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../../.."

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <environment> <hazard-type> --mock N [flags]" >&2
  echo "  e.g. $0 test floods --mock 1 --country KEN" >&2
  exit 1
fi

TARGET_ENVIRONMENT="$1"
shift

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

# shellcheck source=pipeline_job_common.sh
source "${SCRIPT_DIR}/pipeline_job_common.sh"

echo "Submitting mock-data job to environment '${TARGET_ENVIRONMENT}' with arguments: $*"
submit_job "$@"
echo "Done."
