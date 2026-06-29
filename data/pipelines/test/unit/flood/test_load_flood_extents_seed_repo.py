from __future__ import annotations

from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image
from pipelines.constants import DEFAULT_CRS
from pipelines.infra.data_types.data_config_types import DataSource, DataSourceConfig
from pipelines.infra.data_types.enums import HazardType
from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.loaded_data_types import (
    DataType,
    LoadedDataSource,
    RasterData,
)
from pipelines.infra.utils.data_provider_fetchers import _load_seed_repo_flood_extents
from shared.country_data import CountryCodeIso3

# Fake URLs; actual HTTP calls are mocked via patch() so these are never fetched
MOCK_SEED_REPO_BASE_URL = "https://test-seed-repo"
MOCK_FLOOD_EXTENT_BASE_URL = "https://test-seed-repo/flood-extents/data-png/"


def _make_config(
    country: CountryCodeIso3 = CountryCodeIso3.KEN,
) -> DataSourceConfig:
    return DataSourceConfig(
        country_code_iso_3=country,
        source=DataSource.FLOOD_EXTENTS_SEED_REPO,
        hazard_type=HazardType.FLOODS,
    )


def _make_container() -> LoadedDataSource:
    return LoadedDataSource(
        data_type=DataType.UNSPECIFIED,
        data_source=DataSource.FLOOD_EXTENTS_SEED_REPO,
    )


def _make_rgba_png_bytes(values: np.ndarray) -> bytes:
    import io

    int_values = np.round(np.clip(values, 0, None) * 1000).astype(np.uint64)
    r = ((int_values >> 24) & 0xFF).astype(np.uint8)
    g = ((int_values >> 16) & 0xFF).astype(np.uint8)
    b = ((int_values >> 8) & 0xFF).astype(np.uint8)
    a = (int_values & 0xFF).astype(np.uint8)
    rgba = np.dstack([r, g, b, a])
    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_metadata(width: int, height: int) -> dict:
    return {
        "crs": DEFAULT_CRS,
        "transform": [0.01, 0.0, 33.0, 0.0, -0.01, 12.0, 0.0, 0.0, 1.0],
        "width": width,
        "height": height,
        "bounds": {
            "left": 33.0,
            "bottom": 12.0 - height * 0.01,
            "right": 33.0 + width * 0.01,
            "top": 12.0,
        },
        "res": (0.01, 0.01),
        "scales": (1.0,),
        "offsets": (0.0,),
        "count": 4,
        "max_value": 88900,
        "nodata": 0,
        "dtype": "uint32",
    }


class TestLoadSeedRepoFloodExtents:
    def test_loads_manifest_and_creates_provider(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        manifest = {
            "country": "KEN",
            "return_periods": [10, 20, 50, 75, 100],
        }
        config = _make_config()
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=manifest,
        ):
            _load_seed_repo_flood_extents(config, container)

        assert container.data_type == DataType.FLOOD_EXTENT_PROVIDER
        assert isinstance(container.data, FloodExtentProvider)
        assert container.data.available_return_periods == [10, 20, 50, 75, 100]

    def test_raises_when_manifest_download_fails(self, monkeypatch):
        monkeypatch.setenv("GITHUB_DATA_BASE_URL", MOCK_SEED_REPO_BASE_URL)
        config = _make_config()
        container = _make_container()

        with patch(
            "pipelines.infra.utils.data_provider_fetchers.download_json_source",
            return_value=None,
        ):
            with pytest.raises(
                FileNotFoundError, match="Failed to download flood extents manifest"
            ):
                _load_seed_repo_flood_extents(config, container)

        assert container.error is not None


class TestFloodExtentProviderGetRaster:
    def test_downloads_and_decodes_raster_data(self):
        flood_values = np.array([[0.5, 1.2], [0.0, 3.0]], dtype=np.float64)
        png_bytes = _make_rgba_png_bytes(flood_values)
        metadata = _make_metadata(2, 2)

        provider = FloodExtentProvider(
            available_return_periods=[10, 20],
            base_url=MOCK_FLOOD_EXTENT_BASE_URL,
            country="KEN",
        )

        with patch(
            "pipelines.infra.data_types.flood_extent_provider.download_object",
            return_value=png_bytes,
        ), patch(
            "pipelines.infra.data_types.flood_extent_provider.download_json_source",
            return_value=metadata,
        ):
            raster = provider.get_raster(10)

        assert isinstance(raster, RasterData)
        assert raster.crs == DEFAULT_CRS
        assert raster.array.shape == (2, 2)
        np.testing.assert_allclose(raster.array, flood_values, atol=0.01)

    def test_caches_previously_fetched_raster(self):
        flood_values = np.array([[1.0]], dtype=np.float64)
        png_bytes = _make_rgba_png_bytes(flood_values)
        metadata = _make_metadata(1, 1)

        provider = FloodExtentProvider(
            available_return_periods=[10],
            base_url=MOCK_FLOOD_EXTENT_BASE_URL,
            country="KEN",
        )

        with patch(
            "pipelines.infra.data_types.flood_extent_provider.download_object",
            return_value=png_bytes,
        ) as mock_download, patch(
            "pipelines.infra.data_types.flood_extent_provider.download_json_source",
            return_value=metadata,
        ):
            raster1 = provider.get_raster(10)
            raster2 = provider.get_raster(10)

        assert raster1 is raster2
        assert mock_download.call_count == 1

    def test_raises_when_png_download_fails(self):
        provider = FloodExtentProvider(
            available_return_periods=[10],
            base_url=MOCK_FLOOD_EXTENT_BASE_URL,
            country="KEN",
        )

        with patch(
            "pipelines.infra.data_types.flood_extent_provider.download_object",
            return_value=None,
        ):
            with pytest.raises(
                FileNotFoundError, match="Failed to download flood extent PNG"
            ):
                provider.get_raster(10)
