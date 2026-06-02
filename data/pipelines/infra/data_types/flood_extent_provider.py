from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
from pipelines.infra.data_types.loaded_data_types import RasterData
from rasterio.transform import Affine
from shared.download_helpers import download_json_source, download_object
from shared.image_helpers import rgba_png_to_float_array

logger = logging.getLogger(__name__)


@dataclass
class FloodExtentProvider:
    available_return_periods: list[int]
    _base_url: str
    _country: str
    _cache: dict[str, RasterData] = field(default_factory=dict)

    def get_raster(self, return_period: int) -> RasterData:
        key = f"rp{return_period}"

        if key in self._cache:
            return self._cache[key]

        raster = self._fetch_and_decode(key)
        self._cache[key] = raster
        return raster

    def _fetch_and_decode(self, key: str) -> RasterData:
        png_filename = f"{self._country}_flood_extent_{key}.png"
        json_filename = f"{self._country}_flood_extent_{key}_metadata.json"
        png_url = f"{self._base_url}{png_filename}"
        json_url = f"{self._base_url}{json_filename}"

        png_bytes = download_object(png_url)
        if png_bytes is None:
            raise FileNotFoundError(
                f"Failed to download flood extent PNG from '{png_url}'"
            )

        json_data = download_json_source(json_url, check_count=False)
        if json_data is None:
            raise FileNotFoundError(
                f"Failed to download flood extent metadata from '{json_url}'"
            )

        float_array = rgba_png_to_float_array(png_bytes)
        transform = Affine(*json_data["transform"][:6])
        crs = json_data["crs"]
        nodata = json_data["nodata"]

        logger.info(f"Downloaded and decoded flood extent '{key}'")
        return RasterData(
            array=float_array.astype(np.float32),
            transform=transform,
            crs=crs,
            nodata=nodata,
        )
