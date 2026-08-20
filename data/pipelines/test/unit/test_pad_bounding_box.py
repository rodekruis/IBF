from __future__ import annotations

import pytest

from pipelines.infra.utils.raster import pad_bounding_box

# A degree of latitude is ~111.32 km everywhere, so this buffer is almost exactly one degree of
# latitude - which makes the expected padding readable without restating the conversion.
_ONE_DEGREE_LATITUDE_KM = 111.32


class TestPadBoundingBox:
    def test_pads_latitude_by_the_same_distance_at_every_latitude(self):
        at_equator = pad_bounding_box((0.0, 0.0, 1.0, 1.0), _ONE_DEGREE_LATITUDE_KM)
        far_north = pad_bounding_box((0.0, 60.0, 1.0, 61.0), _ONE_DEGREE_LATITUDE_KM)

        assert at_equator[1] == pytest.approx(-1.0)
        assert at_equator[3] == pytest.approx(2.0)
        assert far_north[1] == pytest.approx(59.0)
        assert far_north[3] == pytest.approx(62.0)

    def test_pads_longitude_further_in_degrees_nearer_the_poles(self):
        # A degree of longitude shrinks as cos(latitude), so the same distance in km has to buy
        # more degrees the further from the equator the box sits.
        at_equator = pad_bounding_box((0.0, 0.0, 1.0, 1.0), _ONE_DEGREE_LATITUDE_KM)
        far_north = pad_bounding_box((0.0, 60.0, 1.0, 61.0), _ONE_DEGREE_LATITUDE_KM)

        equator_longitude_padding = -at_equator[0]
        northern_longitude_padding = -far_north[0]

        assert northern_longitude_padding > equator_longitude_padding
        # cos(60.5 degrees) ~ 0.492, so the padding roughly doubles.
        assert northern_longitude_padding == pytest.approx(2.03, abs=0.01)

    def test_pads_longitude_by_the_same_degrees_as_latitude_at_the_equator(self):
        padded = pad_bounding_box((10.0, -0.5, 11.0, 0.5), _ONE_DEGREE_LATITUDE_KM)

        assert padded[0] == pytest.approx(9.0)
        assert padded[2] == pytest.approx(12.0)

    def test_falls_back_to_all_longitudes_at_the_pole(self):
        # Near the poles a degree of longitude shrinks toward zero, so the km-to-degrees
        # division would explode; pad_bounding_box clamps to all longitudes instead.
        padded = pad_bounding_box((0.0, 90.0, 1.0, 90.0), _ONE_DEGREE_LATITUDE_KM)

        assert padded[0] == pytest.approx(-180.0)
        assert padded[2] == pytest.approx(181.0)

    def test_leaves_the_box_unchanged_for_a_zero_buffer(self):
        bounds = (100.0, 5.0, 130.0, 20.0)

        assert pad_bounding_box(bounds, 0.0) == pytest.approx(bounds)
