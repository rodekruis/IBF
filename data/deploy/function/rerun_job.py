"""Submit a single Azure Batch job for a chosen hazard (manual rerun).

Reuses the job/task construction from batch_client.py so manual reruns stay
identical to the scheduled daily runs. Intended to be invoked via
data/deploy/rerun-job.sh, which injects the required environment variables
(secrets read from Key Vault, never from the command line).
"""

import argparse
from datetime import datetime, timezone

from batch_client import create_batch_client, HazardConfig, submit_hazard_job


def main() -> None:
    args = parse_args()
    hazard_config = HazardConfig(
        hazard_type=args.hazard_type,
        config_path=args.config_path or default_config_path(args.hazard_type),
    )
    job_id = submit_hazard_job(
        create_batch_client(), hazard_config, datetime.now(timezone.utc)
    )
    print(f"Submitted Batch job '{job_id}' for hazard '{hazard_config.hazard_type}'.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Submit a single pipeline Batch job for a chosen hazard."
    )
    parser.add_argument(
        "hazard_type",
        help="Hazard name, e.g. floods, drought, tropicalCyclone.",
    )
    parser.add_argument(
        "--config-path",
        help=(
            "Pipeline YAML config path inside the container image. "
            "Defaults to pipelines/infra/configs/<hazard-type>.yaml."
        ),
    )
    return parser.parse_args()


def default_config_path(hazard_type: str) -> str:
    return f"pipelines/infra/configs/{hazard_type}.yaml"


if __name__ == "__main__":
    main()
