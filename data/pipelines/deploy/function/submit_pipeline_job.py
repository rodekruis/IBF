"""Submit a single Azure Batch job for a chosen hazard (manual run).

Reuses the job/task construction from batch_client.py so manual submissions
stay identical to the scheduled daily runs. Intended to be invoked via
data/pipelines/deploy/function/run_pipeline_job.sh (standard run) or
data/pipelines/deploy/function/mock_run_pipeline_job.sh (mock-data run), which inject the
required environment variables (secrets read from Key Vault, never from the
command line).
"""

import argparse
from datetime import datetime, UTC

from batch_client import create_batch_client, PipelineConfig, submit_pipeline_job


def main() -> None:
    args = parse_args()
    pipeline_config = PipelineConfig(
        hazard_type=args.hazard_type,
        config_path=default_config_path(args.hazard_type),
        extra_args=tuple(args.extra_args),
    )
    job_id = submit_pipeline_job(
        create_batch_client(), pipeline_config, datetime.now(UTC)
    )
    print(f"Submitted Batch job '{job_id}' for hazard '{pipeline_config.hazard_type}'.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Submit a single pipeline Batch job for a chosen hazard."
    )
    parser.add_argument(
        "hazard_type",
        help="Hazard name, e.g. floods, drought, tropicalCyclone.",
    )
    parser.add_argument(
        "extra_args",
        nargs=argparse.REMAINDER,
        help=(
            "Extra pipeline flags, debug/test only. Must include --mock and be space free."
        ),
    )
    return parser.parse_args()


def default_config_path(hazard_type: str) -> str:
    return f"pipelines/infra/configs/{hazard_type}.yaml"


if __name__ == "__main__":
    main()
