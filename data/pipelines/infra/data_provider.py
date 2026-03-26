from __future__ import annotations

import logging
from pathlib import Path

from infra.infra_utils.data_provider_fetchers import load_data_container

from pipelines.infra.config_reader import (
    ConfigReader,
    DataSource,
    DataSourceConfig,
    DataType,
    RunTargetType,
)
from pipelines.infra.data_source_container import DataSourceContainer

logger = logging.getLogger(__name__)


class DataProvider:
    def __init__(self) -> None:
        self.loaded_data: dict[str, DataSourceContainer] = {}

    def try_load_data(
        self, config_reader: ConfigReader, country_name: str, run_target: RunTargetType
    ) -> bool:
        data_sources = config_reader.get_data_sources(country_name, run_target)

        if not data_sources:
            logger.warning(
                f"No data sources configured for country '{country_name}' in run_target '{run_target}'"
            )
            return False

        success = True
        for source_config in data_sources:

            data_container = DataSourceContainer(
                name=source_config.name,
                dataType=source_config.type,
                dataLocation=source_config.source,
            )

            try:
                load_data_container(source_config, data_container)
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
    logging.basicConfig(level=logging.INFO)
    config_reader = ConfigReader()
    config_path = Path(__file__).parent / "configs" / "drought.yaml"
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
    print("Complete")
