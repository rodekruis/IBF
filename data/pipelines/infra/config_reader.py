from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

import yaml
from infra.alert_types import HazardType

logger = logging.getLogger(__name__)


@dataclass
class DataSourceConfig:
    name: str
    type: str
    source: str


class RunTargetType(StrEnum):
    DEBUG = "debug"
    TEST = "test"
    PROD = "prod"


@dataclass
class CountryConfig:
    iso_3_code: str
    target_admin_level: int
    data_sources: list[DataSourceConfig]
    output_mode: str
    output_path: str


@dataclass
class RunTargetConfig:
    run_target: RunTargetType
    hazard_type: HazardType
    country_configs: dict[str, CountryConfig]


class ConfigReader:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.run_targets: dict[RunTargetType, RunTargetConfig] = {}

    def load_all(self, path: str | Path) -> bool:
        # Load the config from the path
        path = Path(path)
        if not path.exists():
            self.errors.append(f"Config file not found: {path}")
            return False

        try:
            with open(path, "r", encoding="utf-8") as f:
                self.raw_config = yaml.safe_load(f)
        except yaml.YAMLError as exc:
            self.errors.append(f"Failed to parse YAML: {exc}")
            return False

        # Assign and validate hazard_type
        hazard_type_raw = self.raw_config.get("hazard_type", "")
        try:
            hazard_type = HazardType(hazard_type_raw.lower())
        except ValueError:
            self.errors.append(
                f"Invalid hazard_type '{hazard_type_raw}', "
                f"expected one of: {[e.value for e in HazardType]}"
            )
            return False

        # Populate the self.run_targets
        for target_name, target_config in self.raw_config.get(
            "run_targets", {}
        ).items():
            try:
                run_target_type = RunTargetType(target_name.lower())
            except ValueError:
                self.errors.append(
                    f"Invalid run target '{target_name}', "
                    f"expected one of: {[e.value for e in RunTargetType]}"
                )
                continue

            if not isinstance(target_config, dict):
                self.errors.append(f"Run target '{target_name}' is not a valid mapping")
                continue

            countries: dict[str, CountryConfig] = {}
            for country_raw in target_config.get("countries", []):
                if "name" not in country_raw:
                    self.errors.append(
                        f"Country in run target '{target_name}' is missing 'name'"
                    )
                    continue
                if "target_admin_level" not in country_raw:
                    self.errors.append(
                        f"Country '{country_raw['name']}' in run target '{target_name}' "
                        f"is missing 'target_admin_level'"
                    )
                    continue

                data_sources: list[DataSourceConfig] = []
                for src in country_raw.get("data_sources", []):
                    if "name" not in src:
                        self.errors.append(
                            f"Data source in country '{country_raw['name']}' "
                            f"run target '{target_name}' is missing 'name'"
                        )
                        continue
                    data_sources.append(
                        DataSourceConfig(
                            name=src["name"],
                            type=src.get("type", "json"),
                            source=src.get("source", "dummy"),
                        )
                    )

                output_raw = country_raw.get("output", {})
                iso_3_code = country_raw["name"]

                # if the country data already exists, throw an error
                if iso_3_code in countries:
                    self.errors.append(
                        f"Duplicate country '{iso_3_code}' in run target '{target_name}'"
                    )
                    continue

                countries[iso_3_code] = CountryConfig(
                    iso_3_code=iso_3_code,
                    target_admin_level=country_raw["target_admin_level"],
                    data_sources=data_sources,
                    output_mode=output_raw.get("mode", "local"),
                    output_path=output_raw.get("path", "pipelines/output"),
                )

            self.run_targets[run_target_type] = RunTargetConfig(
                run_target=run_target_type,
                hazard_type=hazard_type,
                country_configs=countries,
            )

        if self.errors:
            # TODO: log all errors here? or return them? Other functions should match
            # Where is that logger above actually logging, and is logging to that enough?
            return False
        return True

    def get_data_sources(
        self, country_name: str, run_target: str
    ) -> tuple[list[DataSourceConfig], str]:

        run_target_configs = self.run_targets.get(run_target)
        if not run_target_configs:
            error_string = f"Run target '{run_target}' not found in config"
            return [], error_string

        country_configs = run_target_configs.country_configs.get(country_name)
        if not country_configs:
            error_string = (
                f"Country '{country_name}' not found in run target '{run_target}'"
            )
            return [], error_string

        data_sources = country_configs.data_sources
        if not data_sources:
            error_string = f"No data sources configured for country '{country_name}' in run_target '{run_target}'"
            return [], error_string

        return data_sources, "success"

    def get_output_config(self, country_name: str, run_target: str) -> dict[str, str]:
        # TODO: update
        for country in self.get_countries(run_target):
            if country.iso_3_code == country_name:
                return {"mode": country.output_mode, "path": country.output_path}
        return {"mode": "local", "path": "pipelines/output"}

    def get_admin_levels(self, country_name: str, run_target: str) -> list[int]:
        # TODO: update
        for country in self.get_countries(run_target):
            if country.iso_3_code == country_name:
                return sorted(country.admin_levels)
        return []


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
        print("Failed to load config:")
        for error in reader.errors:
            print(f"  {error}")
