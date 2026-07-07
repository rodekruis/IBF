"""
Class for loading and providing all data sources.
It loads a config file, and fetches all data source from it.

This file can be run directly to help debug data loading issues.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TypeVar

from dotenv import load_dotenv

from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import CountryRunConfig, DataSource
from pipelines.infra.data_types.loaded_data_types import (
    DataType,
    LoadedDataSource,
    RasterData,
)
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.data_provider_fetchers import load_data_container

logger = logging.getLogger(__name__)

_T = TypeVar("_T")


class DataProvider:
    def __init__(
        self,
        api_client: ApiClient,
        cached_data: bool = False,
        cache_date: str | None = None,
    ) -> None:
        self.loaded_data: dict[DataSource, LoadedDataSource] = {}
        self.api_client = api_client
        self.cached_data = cached_data
        self.cache_date = cache_date

    def try_load_data(self, country_config: CountryRunConfig) -> tuple[bool, list[str]]:
        """Load all data sources for a country.

        Returns a tuple of (success, error messages). Success is True when no
        errors occurred.
        """
        country_name = country_config.country_code_iso_3
        data_sources = country_config.data_sources
        if not data_sources:
            return False, [f"No data sources configured for country '{country_name}'"]

        errors: list[str] = []
        for source_config in data_sources:

            data_container = LoadedDataSource(
                data_type=DataType.UNSPECIFIED,
                data_source=source_config.source,
            )

            try:
                load_data_container(
                    country_config,
                    source_config,
                    data_container,
                    api_client=self.api_client,
                    cache_date=self.cache_date,
                    cached_data=self.cached_data,
                )
            except Exception as exc:
                data_container.error = str(exc)
                error_msg = (
                    f"Failed to load data source '{source_config.source}'"
                    f" for {country_name}: {exc}"
                )
                logger.error(error_msg)
                errors.append(error_msg)

            self.loaded_data[source_config.source] = data_container

        return not errors, errors

    def get_data(self, source: DataSource, expected_type: type[_T]) -> _T:
        if source not in self.loaded_data:
            raise KeyError(f"Data source '{source}' not loaded")
        container = self.loaded_data[source]
        if not isinstance(container.data, expected_type):
            raise TypeError(
                f"Data source '{source}' expected type {expected_type.__name__}, "
                f"got {type(container.data).__name__}"
            )
        return container.data


# If the file is run as main, load one of the default config files and load listed data sources
# This is used for debugging, as well as for sample usage of this class.
# Rewrite as needed.
# If you need to refactor too much here, feel free to delete this code, and only add back what is needed for you.
if __name__ == "__main__":
    # load the env vars here so our debug code below can use them in the data loader.
    load_dotenv()

    config_reader = ConfigReader(source_target=None, infra_only=False)
    config_path = Path(__file__).parent / "configs" / "floods.yaml"
    success = config_reader.load_all(config_path)
    if not success or config_reader.config is None:
        print(f"Failed to load config from path {config_path}")
    else:
        data = config_reader.config
        print(f"Data sources for floods: {data.hazard_type} - {data.country_configs}")

        api_client = ApiClient()
        provider = DataProvider(api_client)
        for country_config in data.country_configs.values():
            provider.try_load_data(country_config)

        # For the loaded data, print out some of the printable fields to verify it loaded
        for container in provider.loaded_data.values():
            if container.data_type == DataType.ADMIN_AREA_SET:
                if isinstance(container.data, AdminAreasSet):
                    first_pcode, first_item = next(
                        iter(container.data.admin_areas.items())
                    )
                    print(
                        f"  [{container.data_source}]: ",
                        f"{first_item.properties.name}, {first_item.properties.pcode}, "
                        f"level: {first_item.properties.admin_level}, "
                        f"country: {first_item.properties.country_code}, "
                        f"parents: {first_item.properties.parent_pcodes}, ",
                    )
                else:
                    print(
                        f"  ERROR: [{container.data_source}] ({container.data_type}): <no data>"
                    )
            elif container.data_type == DataType.ALERT_CONFIG_LIST:
                if isinstance(container.data, list):
                    print(
                        f"  [{container.data_source}] ({container.data_type}): {len(container.data)} alert configs"
                    )
                else:
                    print(
                        f"  ERROR: [{container.data_source}] ({container.data_type}): <no data>"
                    )
            elif container.data_type == DataType.RASTER_DATA:
                raster = container.data
                if isinstance(raster, RasterData):
                    print(
                        f"  [{container.data_source}] ({container.data_type}): "
                        f"shape={raster.array.shape}, "
                        f"crs={raster.crs}, "
                        f"nodata={raster.nodata}"
                    )
    print("Complete")
