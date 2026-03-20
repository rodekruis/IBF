from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import click
from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter

logger = logging.getLogger(__name__)

HazardFunction = Callable[[DataProvider, DataSubmitter, str], None]

HAZARD_FUNCTIONS: dict[str, HazardFunction] = {}


def _register_hazard_functions() -> None:
    from pipelines.v2.drought.forecast import calculate_drought_forecasts
    from pipelines.v2.flood.forecast import calculate_flood_forecasts

    HAZARD_FUNCTIONS["floods"] = calculate_flood_forecasts
    HAZARD_FUNCTIONS["drought"] = calculate_drought_forecasts


def run_forecasts(config_path: str, run_target: str) -> list[str]:
    _register_hazard_functions()

    config_reader = ConfigReader()
    if not config_reader.load(config_path):
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
        logger.info(f"Processing {hazard_type} for {country.name}")

        data_provider = DataProvider()
        if not data_provider.try_load_data(config_reader, country.name, run_target):
            msg = f"Failed to load data for {country.name}"
            logger.error(msg)
            all_errors.append(msg)
            continue

        data_submitter = DataSubmitter()

        hazard_fn(data_provider, data_submitter, country.name)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_dir = str(
            Path(country.output_path) / hazard_type / country.name / timestamp
        )

        errors = data_submitter.send_all(output_dir)
        if errors:
            logger.error(f"Errors for {country.name}: {errors}")
            all_errors.extend(errors)
        else:
            logger.info(f"Output written to {output_dir}")

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
