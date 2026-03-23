from __future__ import annotations

import logging
from dataclasses import dataclass, field

from pipelines.infra.config_reader import ConfigReader, DataSourceConfig


@dataclass
class DataSource:
    name: str
    data: object | None = None
    error: str | None = None
    metadata: dict[str, str | int | float | bool] = field(default_factory=dict)


logger = logging.getLogger(__name__)

# Placeholder data for developing and testing the pipeline infra end-to-end.
# Structure approximates real sources but values are synthetic. Will be replaced
# by actual data loaders (blob, url, local) in a future phase.
DUMMY_DATA: dict[str, object] = {
    "glofas_stations": [
        {
            "station_code": "glofas-station-A",
            "station_name": "Station A",
            "lat": 0.35,
            "lon": 32.60,
            "place_codes": ["place-code-1"],
        },
        {
            "station_code": "glofas-station-B",
            "station_name": "Station B",
            "lat": 1.50,
            "lon": 33.00,
            "place_codes": ["place-code-2"],
        },
    ],
    "glofas_discharge": {
        # Per station, per lead time (0-7 days), per ensemble member (50):
        # water_discharge in m³/s
        "glofas-station-A": {
            lead_time: {f"member-{m}": 80 + lead_time * 5 + m * 2 for m in range(1, 51)}
            for lead_time in range(8)
        },
        "glofas-station-B": {
            lead_time: {f"member-{m}": 40 + lead_time * 3 + m for m in range(1, 51)}
            for lead_time in range(8)
        },
    },
    "admin_boundaries": {
        "place-code-1": {
            "name": "Admin Area 1",
            "adm_level": 2,
            "centroid": {"lat": 0.35, "lon": 32.60},
        },
        "place-code-2": {
            "name": "Admin Area 2",
            "adm_level": 2,
            "centroid": {"lat": 1.50, "lon": 33.00},
        },
    },
    "population": {
        # In reality a raster (GeoTIFF). Represented here as a dict of
        # cell_id -> population count to approximate zonal statistics output.
        "cells": {
            "cell-0-0": {"lat": 0.35, "lon": 32.60, "population": 1200},
            "cell-0-1": {"lat": 0.35, "lon": 32.61, "population": 800},
            "cell-1-0": {"lat": 1.50, "lon": 33.00, "population": 3500},
            "cell-1-1": {"lat": 1.50, "lon": 33.01, "population": 2100},
        },
        "metadata": {
            "crs": "EPSG:4326",
            "resolution": 0.01,
            "nodata": -1,
        },
    },
    "ecmwf_forecast": {
        # In reality a raster (GRIB/NetCDF) per ensemble member per month.
        # Represented here as nested dict: month -> ensemble_member -> cell grid
        # of rainfall anomaly (mm/month).
        "months": {
            "2026-03": {
                f"member-{m}": {
                    "cell-0-0": 45.0 + m * 0.5,
                    "cell-0-1": 42.0 + m * 0.3,
                    "cell-1-0": 60.0 + m * 0.8,
                    "cell-1-1": 55.0 + m * 0.6,
                }
                for m in range(1, 51)
            },
            "2026-04": {
                f"member-{m}": {
                    "cell-0-0": 50.0 + m * 0.4,
                    "cell-0-1": 48.0 + m * 0.2,
                    "cell-1-0": 65.0 + m * 0.7,
                    "cell-1-1": 58.0 + m * 0.5,
                }
                for m in range(1, 51)
            },
            "2026-05": {
                f"member-{m}": {
                    "cell-0-0": 55.0 + m * 0.3,
                    "cell-0-1": 52.0 + m * 0.1,
                    "cell-1-0": 70.0 + m * 0.6,
                    "cell-1-1": 62.0 + m * 0.4,
                }
                for m in range(1, 51)
            },
        },
        "metadata": {
            "crs": "EPSG:4326",
            "resolution": 0.01,
            "nodata": -9999,
            "unit": "mm/month",
        },
    },
    "climate_regions": [
        {
            "id": "climate-region-B",
            "name": "Region B",
            "seasons": ["MAM"],
            "place_codes": ["place-code-2"],
        },
    ],
}


class DataProvider:
    def __init__(self) -> None:
        self.loaded_data: dict[str, DataSource] = {}
        self.config: ConfigReader | None = None

    def try_load_data(
        self, config_reader: ConfigReader, country_name: str, run_target: str
    ) -> bool:
        self.config = config_reader
        data_sources = config_reader.get_data_sources(country_name, run_target)

        if not data_sources:
            logger.warning(
                f"No data sources configured for country '{country_name}' in run_target '{run_target}'"
            )
            return False

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
