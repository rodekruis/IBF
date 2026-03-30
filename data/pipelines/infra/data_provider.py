"""
Class for loading and providing all data sources.
It loads a config file, and fetches all data source from it.

This file can be run directly to help debug data loading issues.
"""

from __future__ import annotations

import logging
from pathlib import Path

from pipelines.infra.admin_boundaries_container import AdminAreasSet
from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_source_types import (
    DataSourceContainer,
    DataType,
    RunTargetType,
)
from pipelines.infra.infra_utils.data_provider_fetchers import load_data_container

logger = logging.getLogger(__name__)


class DataProvider:
    def __init__(self) -> None:
        self.loaded_data: dict[str, DataSourceContainer] = {}

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

            data_container = DataSourceContainer(
                name=source_config.name,
                data_type=DataType.UNSPECIFIED,
                data_source=source_config.source,
            )

            try:
                load_data_container(country_config, source_config, data_container)
            except Exception as exc:
                data_container.error = str(exc)
                logger.error(
                    f"Failed to load data source '{source_config.name}': {exc}"
                )
                success = False

            self.loaded_data[source_config.name] = data_container

        return success

    def get_data(self, name: str) -> DataSourceContainer:
        if name not in self.loaded_data:
            raise KeyError(f"Data source '{name}' not loaded")
        return self.loaded_data[name]


# If the file is run as main, load one of the default config files and load listed data sources
# This is used for debugging, as well as for sample usage of this class.
if __name__ == "__main__":
    # logging.basicConfig(level=logging.INFO)
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
            if container.data_type == DataType.ADMIN_BOUNDARIES_DICT:
                if isinstance(container.data, dict):
                    boundaries: AdminAreasSet
                    for adm_level, boundaries in container.data.items():
                        first_pcode, first_item = next(
                            iter(boundaries.features.items())
                        )
                        print(
                            f"  [{container.name}] adm{adm_level}: ",
                            f"{first_item.properties.name}, {first_item.properties.pcode}, "
                            f"parents: {first_item.properties.parent_pcodes}, ",
                        )
                else:
                    print(f"  [{container.name}] ({container.data_type}): <no data>")
            elif container.data_type == DataType.LOCATION_POINT_DICT:
                if isinstance(container.data, dict):
                    for code, point in container.data.items():
                        print(
                            f"  [{container.name}] {code}: {point.name} ({point.lat}, {point.lon})"
                        )
                else:
                    print(f"  [{container.name}] ({container.data_type}): <no data>")
            elif container.data_type == DataType.STRING:
                print(f"  [{container.name}] ({container.data_type}): {container.data}")
            elif container.data_type == DataType.PNG:
                crs = container.metadata.get("crs", "N/A")
                bounds = container.metadata.get("bounds", "N/A")
                size = len(container.data) if container.data else 0
                print(
                    f"  [{container.name}] ({container.data_type}): {size} bytes, crs={crs}, bounds={bounds}"
                )
    print("Complete")
