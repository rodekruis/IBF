"""
Class for loading and providing all data sources.
It loads a config file, and fetches all data source from it.

This file can be run directly to help debug data loading issues.
"""

from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv

from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource, RunTargetType
from pipelines.infra.data_types.loaded_data_types import DataType, LoadedDataSource
from pipelines.infra.utils.data_provider_fetchers import load_data_container

logger = logging.getLogger(__name__)


class DataProvider:
    def __init__(self) -> None:
        self.loaded_data: dict[DataSource, LoadedDataSource] = {}

    def try_load_data(
        self, config_reader: ConfigReader, country_name: str, run_target: RunTargetType
    ) -> bool:
        country_config = config_reader.get_country_config(country_name, run_target)
        if not country_config:
            logger.error(
                f"Country '{country_name}' not found in config for run_target '{run_target}'"
            )
            return False

        data_sources = country_config.data_sources
        if not data_sources:
            logger.warning(
                f"No data sources configured for country '{country_name}' in run_target '{run_target}'"
            )
            return False

        success = True
        for source_config in data_sources:

            data_container = LoadedDataSource(
                data_type=DataType.UNSPECIFIED,
                data_source=source_config.source,
            )

            try:
                load_data_container(country_config, source_config, data_container)
            except Exception as exc:
                data_container.error = str(exc)
                logger.error(
                    f"Failed to load data source '{source_config.source}': {exc}"
                )
                success = False

            self.loaded_data[source_config.source] = data_container

        return success

    def get_data(self, source: DataSource) -> LoadedDataSource:
        if source not in self.loaded_data:
            raise KeyError(f"Data source '{source}' not loaded")
        return self.loaded_data[source]


# If the file is run as main, load one of the default config files and load listed data sources
# This is used for debugging, as well as for sample usage of this class.
# Rewrite as needed.
# If you need to refactor too much here, feel free to delete this code, and only add back what is needed for you.
if __name__ == "__main__":
    # load the env vars here so our debug code below can use them in the data loader.
    load_dotenv()

    config_reader = ConfigReader()
    config_path = Path(__file__).parent / "configs" / "floods.yaml"
    success = config_reader.load_all(config_path)
    if not success:
        print(f"Failed to load config from path {config_path}")
    else:
        data = config_reader.run_targets.get(RunTargetType.DEBUG)
        print(
            f"Data sources for DEBUG run target: {data.hazard_type} - {data.country_configs}"
        )

        provider = DataProvider()
        for country_code in data.country_configs:
            provider.try_load_data(config_reader, country_code, RunTargetType.DEBUG)

        # For the loaded data, print out some of the printable fields to verify it loaded
        for container in provider.loaded_data.values():
            if container.data_type == DataType.ADMIN_AREA_SET:
                if isinstance(container.data, AdminAreasSet):
                    first_pcode, first_item = next(
                        iter(container.data.admin_areas.items())
                    )
                    print(
                        f"  [{container.data_source}] admin level {container.data.admin_level}: ",
                        f"{first_item.properties.name}, {first_item.properties.pcode}, "
                        f"parents: {first_item.properties.parent_pcodes}, ",
                    )
                else:
                    print(
                        f"  ERROR: [{container.data_source}] ({container.data_type}): <no data>"
                    )
            elif container.data_type == DataType.LOCATION_POINT_DICT:
                if isinstance(container.data, dict):
                    for code, point in container.data.items():
                        print(
                            f"  [{container.data_source}] {code}: {point.name} ({point.lat}, {point.lon})"
                        )
                else:
                    print(
                        f"  ERROR: [{container.data_source}] ({container.data_type}): <no data>"
                    )
            elif container.data_type == DataType.STRING:
                print(
                    f"  [{container.data_source}] ({container.data_type}): {container.data}"
                )
            elif container.data_type == DataType.PNG:
                crs = container.metadata.get("crs", "N/A")
                bounds = container.metadata.get("bounds", "N/A")
                size = len(container.data) if container.data else 0
                print(
                    f"  [{container.data_source}] ({container.data_type}): {size} bytes, crs={crs}, bounds={bounds}"
                )
    print("Complete")
