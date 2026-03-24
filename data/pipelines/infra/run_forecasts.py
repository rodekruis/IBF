from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import click
from dotenv import load_dotenv

from pipelines.drought.forecast import calculate_drought_forecasts
from pipelines.flood.forecast import calculate_flood_forecasts
from pipelines.infra.alert_admin_aggregation import aggregate_to_parent_admin_levels
from pipelines.infra.config_reader import ConfigReader, CountryConfig
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter

logger = logging.getLogger(__name__)

HazardFunction = Callable[[DataProvider, DataSubmitter, str, int], None]

HAZARD_FUNCTIONS: dict[str, HazardFunction] = {}


def _register_hazard_functions() -> None:

    HAZARD_FUNCTIONS["floods"] = calculate_flood_forecasts
    HAZARD_FUNCTIONS["drought"] = calculate_drought_forecasts


def _run_country(
    hazard_fn: HazardFunction,
    country: CountryConfig,
    config_reader: ConfigReader,
    run_target: str,
    hazard_type: str,
) -> list[str]:
    data_provider = DataProvider()
    if not data_provider.try_load_data(config_reader, country.iso_3_code, run_target):
        return [f"Failed to load data for {country.iso_3_code}"]

    data_submitter = DataSubmitter()

    # --- Hazard-specific forecast logic (implemented by data scientists) ---
    hazard_fn(
        data_provider,
        data_submitter,
        country.iso_3_code,
        country.target_admin_level,
    )

    # --- Post-processing: aggregate deepest-level admin area data upward ---
    admin_boundaries: dict[str, dict[str, object]] = data_provider.get_data(
        "admin_boundaries"
    ).data
    for alert in data_submitter.get_alerts():
        aggregate_to_parent_admin_levels(alert, admin_boundaries)

    # --- Write output ---
    # NOTE: local file output is kept for now for /integration tests only
    output_config = config_reader.get_output_config(country.name, run_target)
    output_mode = os.environ.get("IBF_OUTPUT_MODE", output_config["mode"])

    if output_mode == "local":
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_path = str(
            Path(output_config["path"]) / hazard_type / country.name / timestamp
        )
    else:
        output_path = ""

    return data_submitter.send_all(output_mode, output_path)


def run_forecasts(config_path: str, run_target: str) -> list[str]:
    _register_hazard_functions()

    config_reader = ConfigReader()
    if not config_reader.load_file(config_path):
        logger.error(f"Config errors: {config_reader.errors}")
        return config_reader.errors

    hazard_type = config_reader.get_hazard_type()
    hazard_fn = HAZARD_FUNCTIONS.get(hazard_type)
    if hazard_fn is None:
        msg = f"No hazard function registered for '{hazard_type}'"
        logger.error(msg)
        return [msg]

    countries = config_reader.get_countries(run_target)
    if not countries:
        msg = f"No countries configured for run_target '{run_target}'"
        logger.warning(msg)
        return [msg]

    all_errors: list[str] = []

    for country in countries:
        logger.info(f"Processing {hazard_type} for {country.iso_3_code}")

        errors = _run_country(
            hazard_fn, country, config_reader, run_target, hazard_type
        )
        if errors:
            logger.error(f"Errors for {country.iso_3_code}: {errors}")
            all_errors.extend(errors)
        else:
            logger.info(f"Completed {hazard_type} for {country.iso_3_code}")

    return all_errors


@click.command()
@click.option(
    "--config",
    "config_path",
    required=True,
    type=click.Path(exists=True),
    help="Path to the hazard YAML config file.",
)
@click.option(
    "--run-target",
    required=True,
    help="Run target defined in the config (e.g. DEBUG, LIVE).",
)
def main(config_path: str, run_target: str) -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    errors = run_forecasts(config_path, run_target)
    if errors:
        logger.error(f"Pipeline finished with {len(errors)} error(s)")
        sys.exit(1)

    logger.info("Pipeline finished successfully")


if __name__ == "__main__":
    main()
