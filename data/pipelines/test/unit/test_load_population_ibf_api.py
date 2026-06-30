from __future__ import annotations

from unittest.mock import MagicMock

import numpy as np
import pytest
from PIL import Image
from shared.country_data import CountryCodeIso3

from pipelines.constants import DEFAULT_CRS, POPULATION_NODATA_VALUE
from pipelines.infra.data_types.data_config_types import DataSource, DataSourceConfig
from pipelines.infra.data_types.enums import HazardType, LayerName
from pipelines.infra.data_types.loaded_data_types import (
    DataType,
    LoadedDataSource,
    RasterData,
)
from pipelines.infra.utils.data_provider_fetchers import _load_ibf_api_population_data


def _make_config(
    country: CountryCodeIso3 = CountryCodeIso3.KEN,
) -> DataSourceConfig:
    return DataSourceConfig(
        country_code_iso_3=country,
        source=DataSource.POPULATION_IBF_API,
        hazard_type=HazardType.FLOODS,
    )


def _make_container() -> LoadedDataSource:
    return LoadedDataSource(
        data_type=DataType.UNSPECIFIED,
        data_source=DataSource.POPULATION_IBF_API,
    )


def _make_rgba_png_bytes(values: np.ndarray) -> bytes:
    int_values = np.round(np.clip(values, 0, None) * 1000).astype(np.uint64)
    r = ((int_values >> 24) & 0xFF).astype(np.uint8)
    g = ((int_values >> 16) & 0xFF).astype(np.uint8)
    b = ((int_values >> 8) & 0xFF).astype(np.uint8)
    a = (int_values & 0xFF).astype(np.uint8)
    rgba = np.dstack([r, g, b, a])
    img = Image.fromarray(rgba, mode="RGBA")
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_api_metadata_response() -> dict:
    return {
        "id": 1,
        "layerName": LayerName.POPULATION,
        "extent": {"xmin": 0.0, "ymin": -200.0, "xmax": 200.0, "ymax": 0.0},
    }


class TestLoadIbfApiPopulationData:
    def test_produces_raster_data_with_correct_values(self):
        population_values = np.array([[1.5, 2.0], [0.0, 3.5]], dtype=np.float64)
        png_bytes = _make_rgba_png_bytes(population_values)
        api_metadata = _make_api_metadata_response()

        config = _make_config()
        container = _make_container()

        api_client = MagicMock()
        api_client.get_static_raster_metadata.return_value = api_metadata
        api_client.get_static_raster_data_image.return_value = png_bytes

        _load_ibf_api_population_data(config, container, api_client)

        assert container.data_type == DataType.RASTER_DATA
        assert isinstance(container.data, RasterData)
        assert container.data.crs == DEFAULT_CRS
        assert container.data.array.shape == (2, 2)
        assert container.data.nodata == POPULATION_NODATA_VALUE
        np.testing.assert_allclose(container.data.array, population_values, atol=0.01)

    def test_raises_when_metadata_request_fails(self):
        config = _make_config()
        container = _make_container()

        api_client = MagicMock()
        api_client.get_static_raster_metadata.return_value = None

        with pytest.raises(
            ValueError, match="Failed to download population raster metadata"
        ):
            _load_ibf_api_population_data(config, container, api_client)

        assert container.error is not None

    def test_raises_when_data_image_request_fails(self):
        config = _make_config()
        container = _make_container()
        api_metadata = _make_api_metadata_response()

        api_client = MagicMock()
        api_client.get_static_raster_metadata.return_value = api_metadata
        api_client.get_static_raster_data_image.return_value = None

        with pytest.raises(
            ValueError, match="Failed to download population raster data"
        ):
            _load_ibf_api_population_data(config, container, api_client)

        assert container.error is not None
