import io

import numpy as np
import pytest
from PIL import Image
from shared import image_helpers
from shared.image_helpers import rgba_png_to_float_array


def _make_rgba_png_bytes(values: np.ndarray) -> bytes:
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


class TestRgbaPngToFloatArray:
    def test_returns_float64_array(self):
        png_bytes = _make_rgba_png_bytes(np.array([[1.5]]))
        result = rgba_png_to_float_array(png_bytes)
        assert result.dtype == np.float64

    def test_decodes_max_encodable_value_without_overflow(self):
        max_value = (256**4 - 1) / 1000  # documented bound, geotiff_to_rgba_data_array
        png_bytes = _make_rgba_png_bytes(np.array([[max_value]]))
        result = rgba_png_to_float_array(png_bytes)
        np.testing.assert_allclose(result, [[max_value]], atol=0.001)

    def test_matches_expected_values_across_a_non_multiple_of_chunk_size(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        # 7 rows over chunk size 3 forces a final partial chunk (3, 3, 1) —
        # the exact off-by-one risk class chunking introduces.
        monkeypatch.setattr(image_helpers, "_RGBA_DECODE_CHUNK_ROWS", 3)
        values = np.arange(7 * 4, dtype=np.float64).reshape(7, 4) / 3
        png_bytes = _make_rgba_png_bytes(values)
        result = rgba_png_to_float_array(png_bytes)
        np.testing.assert_allclose(result, np.round(values, 3), atol=0.001)

    def test_chunking_does_not_change_the_decoded_result(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        values = np.arange(11 * 5, dtype=np.float64).reshape(11, 5) / 7
        png_bytes = _make_rgba_png_bytes(values)

        monkeypatch.setattr(image_helpers, "_RGBA_DECODE_CHUNK_ROWS", 1000)
        single_chunk_result = rgba_png_to_float_array(png_bytes)

        monkeypatch.setattr(image_helpers, "_RGBA_DECODE_CHUNK_ROWS", 2)
        multi_chunk_result = rgba_png_to_float_array(png_bytes)

        np.testing.assert_array_equal(single_chunk_result, multi_chunk_result)
