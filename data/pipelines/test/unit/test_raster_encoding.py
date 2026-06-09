import base64
import io

import numpy as np
from PIL import Image
from rasterio.transform import from_bounds

from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.raster import raster_to_base64_png


def _make_raster(array: np.ndarray) -> RasterData:
    rows, cols = array.shape
    transform = from_bounds(36.0, 0.0, 38.0, 2.0, cols, rows)
    return RasterData(array=array, transform=transform, crs="EPSG:4326", nodata=0.0)


def test_output_is_valid_base64_png():
    array = np.array([[0, 50], [100, 200]], dtype=np.float32)
    result = raster_to_base64_png(_make_raster(array))

    raw = base64.b64decode(result)
    img = Image.open(io.BytesIO(raw))
    assert img.mode == "L"
    assert img.size == (2, 2)


def test_normalization_scales_to_255():
    array = np.array([[0, 100], [200, 400]], dtype=np.float32)
    result = raster_to_base64_png(_make_raster(array))

    raw = base64.b64decode(result)
    img = Image.open(io.BytesIO(raw))
    pixels = np.array(img)

    assert pixels.max() == 255
    assert pixels[0, 0] == 0


def test_nan_values_become_zero():
    array = np.array([[np.nan, 50], [100, np.nan]], dtype=np.float32)
    result = raster_to_base64_png(_make_raster(array))

    raw = base64.b64decode(result)
    img = Image.open(io.BytesIO(raw))
    pixels = np.array(img)

    assert pixels[0, 0] == 0
    assert pixels[1, 1] == 0
    assert pixels[0, 1] > 0


def test_all_zeros_returns_valid_png():
    array = np.zeros((3, 3), dtype=np.float32)
    result = raster_to_base64_png(_make_raster(array))

    raw = base64.b64decode(result)
    img = Image.open(io.BytesIO(raw))
    pixels = np.array(img)

    assert np.all(pixels == 0)


def test_negative_values_are_clipped_to_zero():
    array = np.array([[-10, 50], [100, 200]], dtype=np.float32)
    result = raster_to_base64_png(_make_raster(array))

    raw = base64.b64decode(result)
    img = Image.open(io.BytesIO(raw))
    pixels = np.array(img)

    assert pixels[0, 0] == 0
