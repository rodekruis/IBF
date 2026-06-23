from __future__ import annotations

import logging
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import click
from dotenv import load_dotenv
from shared.country_data import CountryCodeIso3

from pipelines.drought.forecast import calculate_drought_forecasts
from pipelines.flood.forecast import calculate_flood_forecasts
from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    OutputMode,
    SourceTarget,
)
from pipelines.infra.data_types.enums import ForecastSource, HazardType
from pipelines.infra.data_types.loaded_data_types import DataType
from pipelines.infra.utils.alert_admin_aggregation import (
    aggregate_to_parent_admin_levels,
)
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.infra_mock_generator import make_infra_mock_hazard_function

logger = logging.getLogger(__name__)

# Default output path for local output mode.
DEFAULT_OUTPUT_PATH = "pipelines/output"

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
    hazard_type: HazardType,
    issued_at: datetime | None,
    output_mode: OutputMode,
    output_path: str,
    api_client: ApiClient,
) -> list[str]:
    data_provider = DataProvider(api_client)
    load_errors = data_provider.try_load_data(country)
    if load_errors:
        return load_errors

    try:
        data_submitter = DataSubmitter(api_client)

        # --- Set forecast metadata based on hazard type ---
        forecast_sources = FORECAST_SOURCES[hazard_type]
        data_submitter.set_forecast_metadata(
            issued_at=issued_at or datetime.now(timezone.utc),
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
        admin_areas = data_provider.get_data(
            DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
        )
        for alert in data_submitter.get_alerts():
            aggregate_to_parent_admin_levels(alert, admin_areas)

        # --- Write output ---
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        country_output_path = str(
            Path(output_path) / hazard_type / country.country_code_iso_3 / timestamp
        )

        return data_submitter.send_all(output_mode, country_output_path)
    finally:
        # TODO AB#42516: this will be replaced by an azure-managed clean up policy, once the glofas-download step is isolated from this forecast run.
        _cleanup_temp_data(data_provider)


def _cleanup_temp_data(data_provider: DataProvider) -> None:
    for container in data_provider.loaded_data.values():
        if container.data_type != DataType.PATH_LIST or not isinstance(
            container.data, list
        ):
            continue
        if not container.data:
            continue
        parent = os.path.dirname(container.data[0])
        if parent.startswith(tempfile.gettempdir()):
            shutil.rmtree(parent, ignore_errors=True)


def _resolve_countries(
    country_configs: dict[CountryCodeIso3, CountryRunConfig],
    country_filter: str | None,
) -> list[CountryRunConfig] | str:
    """Determine which countries to run.

    When country_filter is provided (--country CLI flag), run only that single
    country. Otherwise run all configured countries.
    Returns an error message string if resolution fails.
    """
    if country_filter:
        country_code = CountryCodeIso3(country_filter.upper())
        country = country_configs.get(country_code)
        if country is None:
            return f"Country '{country_code}' not found in config"
        return [country]

    countries = list(country_configs.values())
    if not countries:
        return "No countries configured"
    return countries


def _resolve_source_target(mock: int | None) -> SourceTarget:
    """Map the --mock flag value to a source target"""
    if mock is None:
        # No --mock means a live run
        return SourceTarget.LIVE
    if mock == 0:
        # --mock value 0 means no alert
        return SourceTarget.MOCK_NO_ALERT
    # --mock > 0 means alert or multi-alert
    return SourceTarget.MOCK_ALERT


def run_forecasts(
    config_path: str,
    mock: int | None = None,
    infra_only: bool = False,
    issued_at: datetime | None = None,
    country_filter: str | None = None,
    output_mode: OutputMode = OutputMode.API,
    output_path: str = DEFAULT_OUTPUT_PATH,
) -> list[str]:
    _register_hazard_functions()

    source_target = _resolve_source_target(mock)

    config_reader = ConfigReader(source_target=source_target, infra_only=infra_only)
    if not config_reader.load_all(config_path) or config_reader.config is None:
        return ["Failed to load config"]

    pipeline_run_config = config_reader.config

    hazard_type = pipeline_run_config.hazard_type
    hazard_fn = HAZARD_FUNCTIONS.get(hazard_type)
    if hazard_fn is None:
        msg = f"No hazard function registered for '{hazard_type}'"
        logger.error(msg)
        return [msg]

    countries = _resolve_countries(pipeline_run_config.country_configs, country_filter)
    if isinstance(countries, str):
        logger.error(countries)
        return [countries]

    all_errors: list[str] = []

    api_client = ApiClient()

    active_fn = hazard_fn
    if infra_only:
        # bypasses hazard logic in forecast.py
        active_fn = make_infra_mock_hazard_function(mock or 0, hazard_type)
        logger.info(
            f"Skipping hazard logic (--infra-only): generating {mock or 0}"
            f" mock alert(s) per country"
        )

    logger.info(
        f"Start '{hazard_type}' pipeline for '{", ".join(c.country_code_iso_3 for c in countries)}' (source target: '{source_target}'{', infra-only' if infra_only else ''})"
    )

    for country in countries:
        logger.info(f"Forecast '{hazard_type}' for '{country.country_code_iso_3}'")

        errors = _run_country(
            active_fn,
            country,
            hazard_type,
            issued_at,
            output_mode,
            output_path,
            api_client,
        )
        if errors:
            logger.error(f"Errors for '{country.country_code_iso_3}': {errors}")
            all_errors.extend(errors)
        else:
            logger.info(f"Completed '{hazard_type}' for '{country.country_code_iso_3}'")

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
    "--mock",
    "mock",
    type=click.IntRange(min=0),
    default=None,
    help=(
        "Run with mock data instead of LIVE. Value is the alert count: "
        "0 = no-alert, 1 = alert, >1 = multi-alert"
    ),
)
@click.option(
    "--infra-only",
    "infra_only",
    is_flag=True,
    default=False,
    help=(
        "Bypass forecast.py and generate --mock number of alerts."
        "For testing only the pipeline infrastructure."
        "Requires --mock."
    ),
)
@click.option(
    "--issued-at",
    "issued_at_str",
    default=None,
    help="Override the issued_at timestamp (ISO 8601). Requires --mock.",
)
@click.option(
    "--country",
    "country_filter",
    default=None,
    help="Run only this country (ISO 3 code, e.g. KEN). Omit to run all.",
)
@click.option(
    "--output-mode",
    "output_mode_str",
    type=click.Choice([mode.value for mode in OutputMode]),
    default=OutputMode.API.value,
    show_default=True,
    help="Where to send pipeline results: 'api' submits to the IBF API, 'local' writes to disk.",
)
@click.option(
    "--output-path",
    "output_path",
    default=DEFAULT_OUTPUT_PATH,
    show_default=True,
    help="Base directory for local output (used when --output-mode is 'local').",
)
def main(
    config_path: str,
    mock: int | None,
    infra_only: bool,
    issued_at_str: str | None,
    country_filter: str | None,
    output_mode_str: str,
    output_path: str,
) -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if infra_only and mock is None:
        raise click.UsageError("--infra-only requires --mock")
    if mock is not None and not infra_only and mock not in (0, 1):
        raise click.UsageError(
            f"--mock must be 0 or 1 without --infra-only (got {mock}); "
            "use --infra-only to generate more than one alert"
        )
    if issued_at_str and mock is None:
        raise click.UsageError("--issued-at requires --mock")

    issued_at: datetime | None = None
    if issued_at_str:
        parsed = datetime.fromisoformat(issued_at_str)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        issued_at = parsed.astimezone(timezone.utc)

    errors = run_forecasts(
        config_path,
        mock=mock,
        infra_only=infra_only,
        issued_at=issued_at,
        country_filter=country_filter,
        output_mode=OutputMode(output_mode_str),
        output_path=output_path,
    )
    if errors:
        logger.error(f"Pipeline finished with {len(errors)} error(s)")
        sys.exit(1)

    logger.info("Pipeline finished successfully")


if __name__ == "__main__":
    main()
