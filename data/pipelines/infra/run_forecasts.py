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
from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import ForecastSource, HazardType
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    OutputMode,
    RunTargetType,
    Scenario,
    ScenarioType,
)
from pipelines.infra.utils.alert_admin_aggregation import (
    aggregate_to_parent_admin_levels,
)
from pipelines.infra.utils.scenario_alert_generator import make_scenario_hazard_function

logger = logging.getLogger(__name__)

FORECAST_SOURCES: dict[str, list[ForecastSource]] = {
    "floods": [ForecastSource.GLOFAS],
    "drought": [ForecastSource.ECMWF],
}

HazardFunction = Callable[[DataProvider, DataSubmitter, str, int], None]

HAZARD_FUNCTIONS: dict[str, HazardFunction] = {}


def _register_hazard_functions() -> None:

    HAZARD_FUNCTIONS["floods"] = calculate_flood_forecasts
    HAZARD_FUNCTIONS["drought"] = calculate_drought_forecasts


def _run_country(
    hazard_fn: HazardFunction,
    country: CountryRunConfig,
    config_reader: ConfigReader,
    run_target: RunTargetType,
    hazard_type: HazardType,
) -> list[str]:
    data_provider = DataProvider()
    if not data_provider.try_load_data(
        config_reader, country.country_code_iso_3, run_target
    ):
        return [f"Failed to load data for {country.country_code_iso_3}"]

    data_submitter = DataSubmitter()

    # --- Set forecast metadata based on hazard type ---
    if country.scenario and country.scenario.issued_at:
        issued_at = country.scenario.issued_at
    else:
        issued_at = datetime.now(timezone.utc)
    forecast_sources = FORECAST_SOURCES[hazard_type]
    data_submitter.set_forecast_metadata(
        issued_at=issued_at,
        hazard_type=hazard_type,
        forecast_sources=forecast_sources,
    )

    # --- Hazard-specific forecast logic (implemented by data scientists) ---
    hazard_fn(
        data_provider,
        data_submitter,
        country.country_code_iso_3,
        country.target_admin_level,
    )

    # --- Post-processing: aggregate deepest-level admin area data upward ---
    admin_areas = data_provider.get_data(DataSource.ADMIN_AREA_SEED_REPO, AdminAreasSet)
    for alert in data_submitter.get_alerts():
        aggregate_to_parent_admin_levels(alert, admin_areas)

    # --- Write output ---
    output_config = config_reader.get_country_config(
        country.country_code_iso_3, run_target
    )
    if output_config is None:
        raise ValueError(
            f"No output config found for country '{country.country_code_iso_3}' and run target '{run_target}'"
        )
    output_mode = OutputMode(
        os.environ.get("IBF_OUTPUT_MODE", output_config.output_mode)
    )

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = str(
        Path(output_config.output_path)
        / hazard_type
        / country.country_code_iso_3
        / timestamp
    )

    return data_submitter.send_all(output_mode, output_path)


def run_forecasts(
    config_path: str,
    run_target_str: str,
    scenario: Scenario | None = None,
) -> list[str]:
    _register_hazard_functions()

    config_reader = ConfigReader()
    if not config_reader.load_all(config_path):
        return ["Failed to load config"]

    try:
        run_target = RunTargetType(run_target_str.lower())
    except ValueError:
        msg = f"Invalid run target '{run_target_str}', expected one of: {[e.value for e in RunTargetType]}"
        logger.error(msg)
        return [msg]

    run_target_config = config_reader.run_targets.get(run_target)
    if not run_target_config:
        msg = f"Run target '{run_target}' not found in config"
        logger.error(msg)
        return [msg]

    hazard_type = run_target_config.hazard_type
    hazard_fn = HAZARD_FUNCTIONS.get(hazard_type)
    if hazard_fn is None:
        msg = f"No hazard function registered for '{hazard_type}'"
        logger.error(msg)
        return [msg]

    if scenario:
        for country_config in run_target_config.country_configs.values():
            country_config.scenario = scenario

    countries = list(run_target_config.country_configs.values())
    if not countries:
        msg = f"No countries configured for run_target '{run_target}'"
        logger.warning(msg)
        return [msg]

    all_errors: list[str] = []

    for country in countries:
        logger.info(f"Processing {hazard_type} for {country.country_code_iso_3}")

        active_fn = hazard_fn
        if country.scenario:
            # Scenario overrides only the hazard function (forecast.py), so all
            # surrounding infra (data loading, metadata, aggregation, output) still runs.
            active_fn = make_scenario_hazard_function(country.scenario, hazard_type)
            logger.info(
                f"Using scenario '{country.scenario.type}' for {country.country_code_iso_3}"
            )

        errors = _run_country(
            active_fn, country, config_reader, run_target, hazard_type
        )
        if errors:
            logger.error(f"Errors for {country.country_code_iso_3}: {errors}")
            all_errors.extend(errors)
        else:
            logger.info(f"Completed {hazard_type} for {country.country_code_iso_3}")

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
@click.option(
    "--scenario",
    "scenario_str",
    type=click.Choice([e.value for e in ScenarioType], case_sensitive=False),
    default=None,
    help="Override the scenario for all countries (no-alert or alert).",
)
@click.option(
    "--issued-at",
    "issued_at_str",
    default=None,
    help="Override the issued_at timestamp (ISO 8601). Only valid with --scenario.",
)
def main(
    config_path: str,
    run_target: str,
    scenario_str: str | None,
    issued_at_str: str | None,
) -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if issued_at_str and not scenario_str:
        logger.error("--issued-at requires --scenario")
        sys.exit(1)

    scenario: Scenario | None = None
    if scenario_str:
        issued_at = None
        if issued_at_str:
            parsed = datetime.fromisoformat(issued_at_str)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            issued_at = parsed.astimezone(timezone.utc)
        scenario = Scenario(type=ScenarioType(scenario_str), issued_at=issued_at)

    errors = run_forecasts(config_path, run_target, scenario=scenario)
    if errors:
        logger.error(f"Pipeline finished with {len(errors)} error(s)")
        sys.exit(1)

    logger.info("Pipeline finished successfully")


if __name__ == "__main__":
    main()
