from __future__ import annotations

import os
from unittest.mock import patch

import numpy as np
import pytest
import rasterio
from PIL import Image
from shared.country_data import CountryCodeIso3

from pipelines.infra.data_types.data_config_types import DataSource, DataSourceConfig
from pipelines.infra.data_types.enums import HazardType
from pipelines.infra.data_types.loaded_data_types import DataType, LoadedDataSource
from pipelines.infra.utils.data_provider_fetchers import _load_seed_repo_population_data

# Fake base URL injected via GITHUB_DATA_BASE_URL; actual HTTP calls are mocked
MOCK_SEED_REPO_BASE_URL = "https://test-seed-repo"


def _make_config(
    country: CountryCodeIso3 = CountryCodeIso3.KEN,
) -> DataSourceConfig:
    return DataSourceConfig(
        country_code_iso_3=country,
        source=DataSource.POPULATION_SEED_REPO,
        hazard_type=HazardType.FLOODS,
    )


def _make_container() -> LoadedDataSource:
    return LoadedDataSource(
        data_type=DataType.UNSPECIFIED,
        data_source=DataSource.POPULATION_SEED_REPO,
    )


def _make_rgba_png_bytes(values: np.ndarray) -> bytes:
    """Encode a float array into RGBA PNG bytes (same encoding as geotiff_to_rgba_data_array)."""
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


def _make_metadata(width: int, height: int) -> dict:
    return {
        "crs": "EPSG:4326",
        "transform": [100.0, 0.0, 0.0, 0.0, -100.0, 0.0, 0.0, 0.0, 1.0],
        "width": width,
        "height": height,
        "bounds": {"left": 0, "bottom": -height * 100, "right": width * 100, "top": 0},
        "res": (100.0, 100.0),
        "scales": (1.0,),
        "offsets": (0.0,),
        "count": 4,
        "max_value": 10000,
        "nodata": 0,
        "dtype": "uint32",
    }


class TestLoadSeedRepoPopulationData:
    def test_produces_geotiff_with_correct_values(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        population_values = np.array([[1.5, 2.0], [0.0, 3.5]], dtype=np.float64)
        png_bytes = _make_rgba_png_bytes(population_values)
        metadata = _make_metadata(2, 2)

        config = _make_config()
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_object",
            return_value=png_bytes,
        ), patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=metadata,
        ):
            _load_seed_repo_population_data(config, container)

        assert container.data_type == DataType.RASTER_FILE_PATH
        assert isinstance(container.data, str)
        assert os.path.exists(container.data)

        with rasterio.open(container.data) as src:
            data = src.read(1)
            assert src.crs.to_string() == "EPSG:4326"
            assert data.shape == (2, 2)
            np.testing.assert_allclose(data, population_values, atol=0.01)

        os.unlink(container.data)

    def test_raises_when_png_download_fails(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        config = _make_config()
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_object",
            return_value=None,
        ):
            with pytest.raises(ValueError, match="Failed to download PNG"):
                _load_seed_repo_population_data(config, container)

        assert container.error is not None

    def test_raises_when_metadata_download_fails(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        config = _make_config()
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_object",
            return_value=b"fakepng",
        ), patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=None,
        ):
            with pytest.raises(ValueError, match="Failed to download metadata"):
                _load_seed_repo_population_data(config, container)

        assert container.error is not None
