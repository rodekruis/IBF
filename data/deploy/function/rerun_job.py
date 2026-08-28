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
        mock=args.mock,
        country=args.country,
        infra_only=args.infra_only,
        issued_at=args.issued_at,
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
    parser.add_argument(
        "--mock",
        type=int,
        default=None,
        help=(
            "Run with mock data instead of LIVE; value is the alert count "
            "(0 = no-alert, 1 = alert). Mock input data is downloaded from the "
            "seed repo (GITHUB_DATA_BASE_URL)."
        ),
    )
    parser.add_argument(
        "--country",
        default=None,
        help=(
            "Run only these countries (comma-separated ISO 3 codes, e.g. PHL "
            "or KEN,ETH). Omit to run all configured countries."
        ),
    )
    parser.add_argument(
        "--infra-only",
        action="store_true",
        help="Bypass hazard logic and generate --mock number of alerts. Requires --mock.",
    )
    parser.add_argument(
        "--issued-at",
        default=None,
        help="Override the issued_at timestamp (ISO 8601). Requires --mock.",
    )
    return parser.parse_args()


def default_config_path(hazard_type: str) -> str:
    return f"pipelines/infra/configs/{hazard_type}.yaml"


if __name__ == "__main__":
    main()
