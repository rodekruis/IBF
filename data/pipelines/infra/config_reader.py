from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

import yaml
from infra.alert_types import HazardType
from shared.country_data import CountryCode

logger = logging.getLogger(__name__)


class RunTargetType(StrEnum):
    DEBUG = "debug"
    TEST = "test"
    PROD = "prod"


class DataType(StrEnum):
    PNG = "png"
    JSON = "json"
    GEOJSON = "geojson"
    GRIB = "grib"
    NETCDF = "netcdf"
    GEOTIFF = "geotiff"


class DataSource(StrEnum):
    SEED_DATA_REPO_ADMIN = "seed_data_repo_admin"
    SEED_DATA_REPO_POPULATION = "seed_data_repo_population"
    SEED_DATA_REPO_GLOFAS_STATIONS = "seed_data_repo_glofas_stations"
    IBF_API_CLIMATE_REGIONS = "ibf_api_climate_regions"
    TODO_DATA_SOURCE = "todo_data_source"


class OutputMode(StrEnum):
    LOCAL = "local"
    API = "api"


@dataclass
class DataSourceConfig:
    name: str
    iso_3_code: CountryCode
    type: DataType
    source: DataSource


@dataclass
class CountryConfig:
    iso_3_code: CountryCode
    target_admin_level: int
    data_sources: list[DataSourceConfig]
    output_mode: OutputMode
    output_path: str


@dataclass
class RunTargetConfig:
    run_target: RunTargetType
    hazard_type: HazardType
    country_configs: dict[CountryCode, CountryConfig]


# Default output path for local output mode
DEFAULT_OUTPUT_PATH = "pipelines/output"


class ConfigReader:
    def __init__(self) -> None:
        self.run_targets: dict[RunTargetType, RunTargetConfig] = {}

    def load_all(self, path: str | Path) -> bool:

        success = True

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

        # Populate the self.run_targets
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
                logger.error(f"Run target '{target_name}' is not a valid mapping")
                success = False
                continue

            countries: dict[CountryCode, CountryConfig] = {}
            for country_raw in target_config.get("countries", []):
                if "name" not in country_raw:
                    logger.error(
                        f"Country in run target '{target_name}' is missing 'name'"
                    )
                    success = False
                    continue
                if "target_admin_level" not in country_raw:
                    logger.error(
                        f"Country '{country_raw['name']}' in run target '{target_name}' "
                        f"is missing 'target_admin_level'"
                    )
                    success = False
                    continue

                try:
                    iso_3_code = CountryCode(country_raw["name"].upper())
                except ValueError:
                    logger.error(
                        f"Invalid country code '{country_raw['name']}' in run target "
                        f"'{target_name}', expected a valid ISO a-3 code"
                    )
                    success = False
                    continue

                # if the country data already exists, throw an error
                if iso_3_code in countries:
                    logger.error(
                        f"Duplicate country '{iso_3_code}' in run target '{target_name}'"
                    )
                    success = False
                    continue

                # Load all the data source configs
                data_sources: list[DataSourceConfig] = []
                for src in country_raw.get("data_sources", []):
                    if "name" not in src:
                        logger.error(
                            f"Data source in country '{country_raw['name']}' "
                            f"run target '{target_name}' is missing 'name'"
                        )
                        success = False
                        continue
                    try:
                        data_type = DataType(src.get("type", "json"))
                    except ValueError:
                        logger.error(
                            f"Invalid data type '{src.get('type')}' in country "
                            f"'{country_raw['name']}' run target '{target_name}', "
                            f"expected one of: {[e.value for e in DataType]}"
                        )
                        success = False
                        continue

                    try:
                        data_source = DataSource(src.get("source", "todo_data_source"))
                    except ValueError:
                        logger.error(
                            f"Invalid data source '{src.get('source')}' in country "
                            f"'{country_raw['name']}' run target '{target_name}', "
                            f"expected one of: {[e.value for e in DataSource]}"
                        )
                        success = False
                        continue

                    data_sources.append(
                        DataSourceConfig(
                            name=src["name"],
                            iso_3_code=iso_3_code,
                            type=data_type,
                            source=data_source,
                        )
                    )

                target_admin_level = country_raw["target_admin_level"]
                if (
                    not isinstance(target_admin_level, int)
                    or target_admin_level < 1
                    or target_admin_level > 4
                ):
                    logger.error(
                        f"Invalid target_admin_level '{target_admin_level}' for country "
                        f"'{country_raw['name']}' in run target '{target_name}', "
                        f"expected a positive integer between 1 and 4"
                    )
                    success = False
                    continue

                output_raw = country_raw.get("output", {})

                try:
                    output_mode = OutputMode(output_raw["mode"].lower())
                except ValueError:
                    logger.error(
                        f"Invalid output mode '{output_raw.get('mode')}' in country "
                        f"'{country_raw['name']}' run target '{target_name}', "
                        f"expected one of: {[e.value for e in OutputMode]}"
                    )
                    success = False
                    continue

                # optional output path, used for local output.
                output_path = output_raw.get("path", DEFAULT_OUTPUT_PATH)
                if not output_path or not isinstance(output_path, str):
                    logger.error(
                        f"Invalid output path '{output_path}' for country "
                        f"'{country_raw['name']}' in run target '{target_name}', "
                        f"expected a non-empty string"
                    )
                    success = False
                    continue

                countries[iso_3_code] = CountryConfig(
                    iso_3_code=iso_3_code,
                    target_admin_level=target_admin_level,
                    data_sources=data_sources,
                    output_mode=output_mode,
                    output_path=output_path,
                )

            self.run_targets[run_target_type] = RunTargetConfig(
                run_target=run_target_type,
                hazard_type=hazard_type,
                country_configs=countries,
            )

        return success

    def get_data_sources(
        self, country_name: CountryCode, run_target: RunTargetType
    ) -> list[DataSourceConfig]:

        country_config = self.get_country_config(country_name, run_target)
        if not country_config:
            # Error already logged. Return an empty list
            return []

        data_sources = country_config.data_sources
        if not data_sources:
            logger.error(
                f"No data sources configured for country '{country_name}' in run_target '{run_target}'"
            )
            return []

        return data_sources

    def get_country_config(
        self, country_name: CountryCode, run_target: RunTargetType
    ) -> CountryConfig:
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
