"""
Class for opening, parsing, validating, and providing a pipeline yaml config

This file can be run directly to help debug config loading issues.
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from pipelines.infra.data_types.data_config_types import (
    CountryCodeIso3,
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
    PipelineRunConfig,
    RunTarget,
)
from pipelines.infra.data_types.enums import HazardType

logger = logging.getLogger(__name__)


class ConfigReader:
    def __init__(
        self,
        *,
        run_target: RunTarget | None,
        infra_only: bool,
    ) -> None:
        self.config: PipelineRunConfig | None = None
        self.run_target = run_target
        self.infra_only = infra_only

    def load_all(self, path: str | Path) -> bool:
        """Load and parse config from YAML file."""
        # Clear any existing config
        self.config = None
        config_raw = None

        # Load the config from the path
        path = Path(path)
        if not path.exists():
            logger.error(f"Config file not found: {path}")
            return False

        try:
            with open(path, "r", encoding="utf-8") as f:
                config_raw = yaml.safe_load(f)
        except yaml.YAMLError as exc:
            logger.error(f"Failed to parse YAML: {exc}")
            return False

        if config_raw is None:
            logger.error(f"Config file is empty: {path}")
            return False

        # Assign and validate hazard_type
        hazard_type_raw = config_raw.get("hazard_type", "")
        try:
            hazard_type = HazardType(hazard_type_raw.lower())
        except ValueError:
            logger.error(
                f"Invalid hazard_type '{hazard_type_raw}',"
                f" expected one of: {[e.value for e in HazardType]}"
            )
            return False

        return self._parse_config(config_raw, hazard_type)

    def get_country_config(
        self, country_name: CountryCodeIso3
    ) -> CountryRunConfig | None:
        """
        Get the parsed config for a specific country, or None if not found.
        """
        if self.config is None:
            logger.error("Config not loaded")
            return None

        country_config = self.config.country_configs.get(country_name)
        if not country_config:
            logger.error(f"Country '{country_name}' not found in config")
            return None

        return country_config

    def _parse_config(self, config_raw: dict, hazard_type: HazardType) -> bool:
        """Parse the hazard-country config to populate self.config."""
        success = True

        countries: dict[CountryCodeIso3, CountryRunConfig] = {}
        if not self._parse_countries(countries, config_raw, hazard_type):
            success = False

        self.config = PipelineRunConfig(
            hazard_type=hazard_type,
            country_configs=countries,
        )

        return success

    def _parse_countries(
        self,
        countries: dict[CountryCodeIso3, CountryRunConfig],
        config: dict,
        hazard_type: HazardType,
    ) -> bool:
        """Parse countries from run target config and add to provided dict."""
        success = True

        for country_raw in config.get("countries", []):
            if "iso_3_code" not in country_raw:
                logger.error("Country is missing 'iso_3_code'")
                success = False
                continue
            if "target_admin_level" not in country_raw:
                logger.error(
                    f"Country '{country_raw['iso_3_code']}' is missing 'target_admin_level'"
                )
                success = False
                continue

            try:
                iso_3_code = CountryCodeIso3(country_raw["iso_3_code"].upper())
            except ValueError:
                logger.error(
                    f"Invalid country code '{country_raw['iso_3_code']}',"
                    f" expected a valid ISO a-3 code"
                )
                success = False
                continue

            # if the country data already exists, throw an error
            if iso_3_code in countries:
                logger.error(f"Duplicate country '{iso_3_code}' in config")
                success = False
                continue

            # Parse data sources (required per country)
            data_sources_raw = country_raw.get("data_sources")
            if not isinstance(data_sources_raw, list) or not data_sources_raw:
                logger.error(
                    f"Country '{iso_3_code}' is missing a non-empty 'data_sources' list"
                )
                success = False
                continue
            data_sources: list[DataSourceConfig] = []
            if not self._parse_data_sources(
                data_sources, iso_3_code, data_sources_raw, hazard_type
            ):
                success = False
                # Continue processing - still validate rest of country config

            # Require a forecast source for the selected run target. Skipped under
            # --infra-only (forecast.py is bypassed) and for unfiltered debug
            # loads (run_target is None, all sources kept).
            if (
                not self.infra_only
                and self.run_target is not None
                and not any(source.run_target is not None for source in data_sources)
            ):
                logger.error(
                    f"No forecast data source configured for run target"
                    f" '{self.run_target}' for country '{iso_3_code}'"
                )
                success = False
                continue

            target_admin_level = country_raw["target_admin_level"]
            if (
                not isinstance(target_admin_level, int)
                or target_admin_level < 1
                or target_admin_level > 4
            ):
                logger.error(
                    f"Invalid target_admin_level '{target_admin_level}' for country '{iso_3_code}',"
                    f" expected a positive integer between 1 and 4"
                )
                success = False
                continue

            countries[iso_3_code] = CountryRunConfig(
                country_code_iso_3=iso_3_code,
                target_admin_level=target_admin_level,
                data_sources=data_sources,
            )

        return success

    def _parse_data_sources(
        self,
        data_sources: list[DataSourceConfig],
        iso_3_code: CountryCodeIso3,
        data_sources_raw: list[dict],
        hazard_type: HazardType,
    ) -> bool:
        """Parse and filter a country's data sources."""
        success = True

        for source_entry in data_sources_raw:
            # Parse the optional run_target tag
            source_run_target: RunTarget | None = None
            run_target_raw = source_entry.get("run_target")

            if run_target_raw is not None:
                try:
                    source_run_target = RunTarget(str(run_target_raw).lower())
                except ValueError:
                    logger.error(
                        f"Invalid run_target '{run_target_raw}' for data source"
                        f" '{source_entry.get('source')}' in country '{iso_3_code}',"
                        f" expected one of: {[e.value for e in RunTarget]}"
                    )
                    success = False
                    continue

            # Skip data sources with run target
            if source_run_target is not None:
                if self.infra_only:
                    # Skip all run target data sources in infra-only
                    continue
                if self.run_target is not None and source_run_target != self.run_target:
                    # Skip run target data sources that do not match the pipeline run target
                    continue

            # Initialize the data sources
            try:
                data_source = DataSource(source_entry.get("source", "todo_data_source"))
            except ValueError:
                logger.error(
                    f"Invalid data source '{source_entry.get('source')}' in country '{iso_3_code}',"
                    f" expected one of: {[e.value for e in DataSource]}"
                )
                success = False
                continue

            data_sources.append(
                DataSourceConfig(
                    country_code_iso_3=iso_3_code,
                    source=data_source,
                    hazard_type=hazard_type,
                    run_target=source_run_target,
                )
            )

        return success


# If the file is run as main, load one of the default config files and print it out.
# This is used for debugging
if __name__ == "__main__":
    reader = ConfigReader(run_target=None, infra_only=False)
    config_path = Path(__file__).parent / "configs" / "drought.yaml"
    if reader.load_all(config_path) and reader.config is not None:
        print(f"== Hazard: {reader.config.hazard_type}")
        for code, country in reader.config.country_configs.items():
            print(f"  -- {code}: {country}")
    else:
        print(f"Failed to load config from path {config_path}")
