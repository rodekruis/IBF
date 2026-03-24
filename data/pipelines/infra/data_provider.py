from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from infra.dummy_data import DUMMY_DATA

from pipelines.infra.config_reader import ConfigReader, DataSourceConfig, RunTargetType


@dataclass
class DataSource:
    name: str
    data: object | None = None
    error: str | None = None
    metadata: dict[str, str | int | float | bool] = field(default_factory=dict)


logger = logging.getLogger(__name__)


class DataProvider:
    def __init__(self) -> None:
        self.loaded_data: dict[str, DataSource] = {}

    def try_load_data(
        self, config_reader: ConfigReader, country_name: str, run_target: RunTargetType
    ) -> bool:
        data_sources, reader_errors = config_reader.get_data_sources(
            country_name, run_target
        )

        if not data_sources:
            logger.warning(
                f"No data sources configured for country '{country_name}' in run_target '{run_target}'. Error: {reader_errors}"
            )
            return False

        # TOD from this point
        success = True
        for source_config in data_sources:
            data_source = DataSource(name=source_config.name)
            try:
                data_source.data = self._load_from_source(source_config)
                data_source.metadata["type"] = source_config.type
                data_source.metadata["source"] = source_config.source
            except Exception as exc:
                data_source.error = str(exc)
                logger.error(
                    f"Failed to load data source '{source_config.name}': {exc}"
                )
                success = False

            self.loaded_data[source_config.name] = data_source

        return success

    def get_data(self, name: str) -> DataSource:
        if name not in self.loaded_data:
            raise KeyError(f"Data source '{name}' not loaded")
        return self.loaded_data[name]

    def _load_from_source(self, source_config: DataSourceConfig) -> object:
        if source_config.source == "dummy":
            return self._load_dummy(source_config)
        if source_config.source == "local":
            raise NotImplementedError("Local file loading not yet implemented")
        if source_config.source == "url":
            raise NotImplementedError("URL loading not yet implemented")
        if source_config.source == "blob":
            raise NotImplementedError("Blob storage loading not yet implemented")
        raise ValueError(f"Unknown source type: '{source_config.source}'")

    def _load_dummy(self, source_config: DataSourceConfig) -> object:
        if source_config.name in DUMMY_DATA:
            return DUMMY_DATA[source_config.name]
        raise KeyError(f"No dummy data available for source '{source_config.name}'")


# If the file is run as main, load one of the default config files and load listed data sources
# This is used for debugging
if __name__ == "__main__":
    config_reader = ConfigReader()
    config_path = Path(__file__).parent / "configs" / "drought.yaml"
    success = config_reader.load_all(config_path)
    if not success:
        print("Failed to load config:")
        for error in config_reader.errors:
            print(f"  {error}")
    else:
        data = config_reader.run_targets.get(RunTargetType.DEBUG)
    print("Complete")
