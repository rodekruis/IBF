import base64
import io

import numpy as np
from PIL import Image
from rasterio.transform import from_bounds

from pipelines.constants import DEFAULT_CRS, POPULATION_NODATA_VALUE
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.raster import raster_to_base64_png

_TC_STYLE_NODATA = 3.4028234663852886e38  # real GRIB missing-value sentinel


def _make_raster(
    array: np.ndarray, nodata: float = POPULATION_NODATA_VALUE
) -> RasterData:
    rows, cols = array.shape
    transform = from_bounds(36.0, 0.0, 38.0, 2.0, cols, rows)
    return RasterData(
        array=array,
        transform=transform,
        crs=DEFAULT_CRS,
        nodata=nodata,
    )


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


def test_huge_positive_nodata_sentinel_is_excluded_not_treated_as_max():
    array = np.array(
        [[_TC_STYLE_NODATA, 45.0], [45.0, _TC_STYLE_NODATA]], dtype=np.float32
    )
    result = raster_to_base64_png(_make_raster(array, nodata=_TC_STYLE_NODATA))

    raw = base64.b64decode(result)
    img = Image.open(io.BytesIO(raw))
    pixels = np.array(img)

    assert pixels[0, 1] == 255  # real hazard reading -> brightest
    assert pixels[1, 0] == 255
    assert pixels[0, 0] == 0  # nodata sentinel -> not rendered as "max"
    assert pixels[1, 1] == 0
