"""
Class for opening, parsing, validating, and providing a pipeline yaml config

This file can be run directly to help debug config loading issues.
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from pipelines.infra.alert_types import HazardType
from pipelines.infra.data_types.data_config_types import (
    CountryCodeIso3,
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
    OutputMode,
    PipelineRunConfig,
    RunTargetType,
)

logger = logging.getLogger(__name__)


# Default output path for local output mode
DEFAULT_OUTPUT_PATH = "pipelines/output"


class ConfigReader:
    def __init__(self) -> None:
        self.run_targets: dict[RunTargetType, PipelineRunConfig] = {}

    def load_all(self, path: str | Path) -> bool:
        """Load and parse config from YAML file."""
        # Clear any existing config
        self.run_targets = {}

        # Load the config from the path
        path = Path(path)
        if not path.exists():
            logger.error(f"Config file not found: {path}")
            return False

        try:
            with open(path, "r", encoding="utf-8") as f:
                self.raw_config = yaml.safe_load(f)
        except yaml.YAMLError as exc:
            logger.error(f"Failed to parse YAML: {exc}")
            return False

        if self.raw_config is None:
            logger.error(f"Config file is empty: {path}")
            return False

        # Assign and validate hazard_type
        hazard_type_raw = self.raw_config.get("hazard_type", "")
        try:
            hazard_type = HazardType(hazard_type_raw.lower())
        except ValueError:
            logger.error(
                f"Invalid hazard_type '{hazard_type_raw}', "
                f"expected one of: {[e.value for e in HazardType]}"
            )
            return False

        return self._parse_run_targets(hazard_type)

    def get_country_config(
        self, country_name: CountryCodeIso3, run_target: RunTargetType
    ) -> CountryRunConfig | None:
        """
        Get the parsed config for a specific country and run target, or None if not found.
        """
        run_target_configs = self.run_targets.get(run_target)
        if not run_target_configs:
            logger.error(f"Run target '{run_target}' not found in config")
            return None

        country_config = run_target_configs.country_configs.get(country_name)
        if not country_config:
            logger.error(
                f"Country '{country_name}' not found in run target '{run_target}'"
            )
            return None

        return country_config

    def _parse_run_targets(self, hazard_type: HazardType) -> bool:
        """Parse run targets from raw config and populate self.run_targets."""
        success = True
        for target_name, target_config in self.raw_config.get(
            "run_targets", {}
        ).items():
            try:
                run_target_type = RunTargetType(target_name.lower())
            except ValueError:
                logger.error(
                    f"Invalid run target '{target_name}', "
                    f"expected one of: {[e.value for e in RunTargetType]}"
                )
                success = False
                continue

            if not isinstance(target_config, dict):
                logger.error(f"Run target '{target_name}' does not have a valid dict")
                success = False
                continue

            countries: dict[CountryCodeIso3, CountryRunConfig] = {}
            if not self._parse_countries(countries, target_config, target_name):
                success = False
                # Continue processing - still add run target with whatever countries parsed

            self.run_targets[run_target_type] = PipelineRunConfig(
                run_target=run_target_type,
                hazard_type=hazard_type,
                country_configs=countries,
            )

        return success

    def _parse_countries(
        self,
        countries: dict[CountryCodeIso3, CountryRunConfig],
        target_config: dict,
        target: RunTargetType,
    ) -> bool:
        """Parse countries from run target config and add to provided dict."""
        success = True
        for country_raw in target_config.get("countries", []):
            if "iso_3_code" not in country_raw:
                logger.error(
                    f"Country in run target '{target}' is missing 'iso_3_code'"
                )
                success = False
                continue
            if "target_admin_level" not in country_raw:
                logger.error(
                    f"Country '{country_raw['iso_3_code']}' in run target '{target}' "
                    f"is missing 'target_admin_level'"
                )
                success = False
                continue

            try:
                iso_3_code = CountryCodeIso3(country_raw["iso_3_code"].upper())
            except ValueError:
                logger.error(
                    f"Invalid country code '{country_raw['iso_3_code']}' in run target "
                    f"'{target}', expected a valid ISO a-3 code"
                )
                success = False
                continue

            # if the country data already exists, throw an error
            if iso_3_code in countries:
                logger.error(
                    f"Duplicate country '{iso_3_code}' in run target '{target}'"
                )
                success = False
                continue

            # Parse data sources
            data_sources: list[DataSourceConfig] = []
            if not self._parse_data_sources(
                data_sources, iso_3_code, country_raw, target
            ):
                success = False
                # Continue processing - still validate rest of country config

            target_admin_level = country_raw["target_admin_level"]
            if (
                not isinstance(target_admin_level, int)
                or target_admin_level < 1
                or target_admin_level > 4
            ):
                logger.error(
                    f"Invalid target_admin_level '{target_admin_level}' for country "
                    f"'{iso_3_code}' in run target '{target}', "
                    f"expected a positive integer between 1 and 4"
                )
                success = False
                continue

            output_raw = country_raw.get("output", {})

            try:
                output_mode = OutputMode(output_raw["mode"].lower())
            except (ValueError, KeyError):
                logger.error(
                    f"Invalid output mode: '{output_raw.get('mode')}' "
                    f"for country '{iso_3_code}' run target '{target}', "
                    f"expected one of: {[e.value for e in OutputMode]}"
                )
                success = False
                continue

            # optional output path, used for local output.
            output_path = output_raw.get("path", DEFAULT_OUTPUT_PATH)
            if not output_path or not isinstance(output_path, str):
                logger.error(
                    f"Invalid output path '{output_path}' for country "
                    f"'{iso_3_code}' in run target '{target}', "
                    f"expected a non-empty string"
                )
                success = False
                continue

            countries[iso_3_code] = CountryRunConfig(
                country_code_iso_3=iso_3_code,
                target_admin_level=target_admin_level,
                data_sources=data_sources,
                output_mode=output_mode,
                output_path=output_path,
            )

        return success

    def _parse_data_sources(
        self,
        data_sources: list[DataSourceConfig],
        iso_3_code: CountryCodeIso3,
        country_raw: dict,
        target: RunTargetType,
    ) -> bool:
        """Parse data sources from country config and append to provided list."""
        success = True
        for src in country_raw.get("data_sources", []):
            try:
                data_source = DataSource(src.get("source", "todo_data_source"))
            except ValueError:
                logger.error(
                    f"Invalid data source '{src.get('source')}' in country "
                    f"'{iso_3_code}' run target '{target}', "
                    f"expected one of: {[e.value for e in DataSource]}"
                )
                success = False
                continue

            data_sources.append(
                DataSourceConfig(
                    country_code_iso_3=iso_3_code,
                    source=data_source,
                )
            )

        return success


# If the file is run as main, load one of the default config files and print it out.
# This is used for debugging
if __name__ == "__main__":
    reader = ConfigReader()
    config_path = Path(__file__).parent / "configs" / "drought.yaml"
    if reader.load_all(config_path):
        for run_target, config in reader.run_targets.items():
            print(f"\n== Run target: {run_target}")
            print(f"== Hazard: {config.hazard_type}")
            for code, country in config.country_configs.items():
                print(f"  -- {code}: {country}")
    else:
        print("Failed to load config from path {config_path}")
