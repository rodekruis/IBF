from __future__ import annotations

import numpy as np
import pytest
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.tropical_cyclone.constants import GEFS_NATIVE_LEAD_TIME_STEP_HOURS
from pipelines.tropical_cyclone.extract_forecast import (
    _aggregate_bucket_rasters,
    _envelope_max,
    _parse_gefs_wind_path,
    _parse_lead_hour_spectrum,
    _resolve_configured_interval_hours,
    _scale_excluding_nodata,
)
from rasterio.transform import from_origin

# Real GRIB2/IEEE missing-value sentinel used by GEFS wind rasters (see
# extract_forecast.py's _read_wind_speed_raster) - a huge positive number, not an arbitrary
# small one, so these tests actually cover the risky case: if exclusion ever broke, this
# value would dominate every max instead of a harmless small number.
_NODATA = 3.4028234663852886e38


def _make_raster(value: float, nodata: float = _NODATA) -> RasterData:
    return RasterData(
        array=np.array([[value]], dtype=np.float32),
        transform=from_origin(0, 1, 1, 1),
        crs="EPSG:4326",
        nodata=nodata,
    )


class TestParseLeadHourSpectrum:
    def test_parses_standard_spectrum(self):
        temporal_extent = {
            "lead-time-spectrum": [f"{h}-hour" for h in range(0, 169, 3)]
        }
        assert _parse_lead_hour_spectrum(temporal_extent) == list(range(0, 169, 3))

    def test_sorts_an_unordered_spectrum(self):
        temporal_extent = {"lead-time-spectrum": ["6-hour", "0-hour", "3-hour"]}
        assert _parse_lead_hour_spectrum(temporal_extent) == [0, 3, 6]

    def test_raises_when_spectrum_missing(self):
        with pytest.raises(ValueError, match="missing 'lead-time-spectrum'"):
            _parse_lead_hour_spectrum({})

    def test_raises_when_spectrum_empty(self):
        with pytest.raises(ValueError, match="missing 'lead-time-spectrum'"):
            _parse_lead_hour_spectrum({"lead-time-spectrum": []})


class TestResolveConfiguredIntervalHours:
    def test_derives_native_three_hour_step(self):
        assert _resolve_configured_interval_hours([0, 3, 6, 9]) == 3

    def test_derives_coarser_six_hour_step(self):
        assert _resolve_configured_interval_hours([0, 6, 12]) == 6

    def test_falls_back_to_native_step_for_single_point_spectrum(self):
        assert (
            _resolve_configured_interval_hours([0]) == GEFS_NATIVE_LEAD_TIME_STEP_HOURS
        )

    def test_raises_on_irregular_spacing(self):
        with pytest.raises(ValueError, match="constant spacing"):
            _resolve_configured_interval_hours([0, 3, 6, 11, 14])

    def test_raises_when_interval_is_not_a_multiple_of_native_step(self):
        with pytest.raises(ValueError, match="multiple of GEFS's native"):
            _resolve_configured_interval_hours([0, 5, 10, 15])


class TestParseGefsWindPath:
    def test_parses_member_and_lead_hour(self):
        parsed = _parse_gefs_wind_path(
            "gefs.20260710/00/atmos/pgrb2sp25/gep01.t00z.pgrb2s.0p25.f003"
        )
        assert parsed is not None
        assert parsed.member == "gep01"
        assert parsed.lead_hour == 3
        assert parsed.cycle_datetime.strftime("%Y%m%d%H") == "2026071000"

    def test_parses_control_member(self):
        parsed = _parse_gefs_wind_path(
            "gefs.20260710/00/atmos/pgrb2sp25/gec00.t00z.pgrb2s.0p25.f000"
        )
        assert parsed is not None
        assert parsed.member == "gec00"

    def test_rejects_idx_sidecar_file(self):
        assert (
            _parse_gefs_wind_path(
                "gefs.20260710/00/atmos/pgrb2sp25/gep01.t00z.pgrb2s.0p25.f003.idx"
            )
            is None
        )

    def test_rejects_unrecognized_path(self):
        assert _parse_gefs_wind_path("not/a/real/path.grib2") is None


class TestEnvelopeMax:
    def test_single_raster_is_passed_through_unchanged(self):
        raster = _make_raster(10.0)
        assert _envelope_max([raster]) is raster

    def test_combines_via_per_cell_max(self):
        result = _envelope_max([_make_raster(10.0), _make_raster(25.0)])
        assert result.array[0, 0] == 25.0

    def test_excludes_nodata_from_the_max(self):
        result = _envelope_max([_make_raster(_NODATA), _make_raster(12.0)])
        assert result.array[0, 0] == 12.0

    def test_stays_nodata_when_every_input_is_nodata(self):
        result = _envelope_max([_make_raster(_NODATA), _make_raster(_NODATA)])
        assert result.array[0, 0] == _NODATA


class TestAggregateBucketRasters:
    def test_native_step_bucket_is_one_raster_per_member_unchanged(self):
        rasters_by_member_and_lead_hour = {
            ("gec00", 0): _make_raster(10.0),
            ("gep01", 0): _make_raster(12.0),
        }
        result = _aggregate_bucket_rasters(rasters_by_member_and_lead_hour, 0, 3)
        assert sorted(raster.array[0, 0] for raster in result) == [10.0, 12.0]

    def test_aggregates_two_native_steps_into_a_coarser_bucket(self):
        rasters_by_member_and_lead_hour = {
            ("gec00", 0): _make_raster(10.0),
            ("gec00", 3): _make_raster(30.0),
        }
        result = _aggregate_bucket_rasters(rasters_by_member_and_lead_hour, 0, 6)
        assert len(result) == 1
        assert result[0].array[0, 0] == 30.0

    def test_uses_partial_data_when_a_member_is_missing_one_native_step(self):
        rasters_by_member_and_lead_hour = {
            ("gec00", 0): _make_raster(10.0),
            ("gec00", 3): _make_raster(30.0),
            ("gep01", 0): _make_raster(5.0),
        }
        result = _aggregate_bucket_rasters(rasters_by_member_and_lead_hour, 0, 6)
        assert sorted(raster.array[0, 0] for raster in result) == [5.0, 30.0]

    def test_member_entirely_absent_from_the_bucket_window_is_excluded(self):
        rasters_by_member_and_lead_hour = {
            ("gec00", 6): _make_raster(10.0),
        }
        result = _aggregate_bucket_rasters(rasters_by_member_and_lead_hour, 0, 6)
        assert result == []


class TestScaleExcludingNodata:
    def test_scales_a_real_value_by_the_conversion_factor(self):
        array = np.array([[45.0]], dtype=np.float32)
        result = _scale_excluding_nodata(array, _NODATA, 1.21)
        np.testing.assert_allclose(result, [[54.45]], rtol=1e-5)

    def test_nodata_cell_stays_exactly_nodata_not_inf(self):
        array = np.array([[_NODATA]], dtype=np.float32)
        result = _scale_excluding_nodata(array, _NODATA, 1.21)
        assert result[0, 0] == _NODATA
        assert not np.isinf(result).any()

    def test_is_a_noop_at_factor_1_for_phl(self):
        array = np.array([[45.0, _NODATA]], dtype=np.float32)
        result = _scale_excluding_nodata(array, _NODATA, 1.0)
        assert result[0, 0] == 45.0
        assert result[0, 1] == _NODATA

    def test_mixed_array_scales_only_non_nodata_cells(self):
        array = np.array([45.0, _NODATA, 30.0], dtype=np.float32)
        result = _scale_excluding_nodata(array, _NODATA, 1.05)
        np.testing.assert_allclose(result[0], 47.25, rtol=1e-5)
        assert result[1] == _NODATA
        np.testing.assert_allclose(result[2], 31.5, rtol=1e-5)
