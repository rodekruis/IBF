from __future__ import annotations

import numpy as np
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.tropical_cyclone.compute_wind_extent import compute_alert_extent
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalSeverity
from rasterio.transform import from_origin

# Real GRIB2/IEEE missing-value sentinel used by GEFS wind rasters - see
# test_determine_alerts.py for why this is used instead of an arbitrary small value.
_NODATA = 3.4028234663852886e38


def _make_raster(value: float) -> RasterData:
    return RasterData(
        array=np.full((2, 2), value, dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=_NODATA,
    )


def _make_severity(
    median_wind_speed: float, rasters: list[RasterData], time_interval_start: str = "t0"
) -> TimeIntervalSeverity:
    return TimeIntervalSeverity(
        time_interval_start=time_interval_start,
        time_interval_end="t1",
        median_wind_speed=median_wind_speed,
        ensemble_wind_speeds=[],
        ensemble_wind_speed_rasters=rasters,
    )


class TestComputeAlertExtent:
    def test_picks_the_bucket_with_the_highest_median(self):
        low = _make_severity(35.0, [_make_raster(40.0)], time_interval_start="low")
        high = _make_severity(45.0, [_make_raster(50.0)], time_interval_start="high")

        result = compute_alert_extent([low, high])

        assert result.array[0, 0] == 50.0

    def test_envelope_is_a_per_cell_max_across_members(self):
        member_a = _make_raster(10.0)
        member_a.array[0, 0] = 40.0
        member_b = _make_raster(10.0)
        member_b.array[0, 0] = 60.0
        severity = _make_severity(45.0, [member_a, member_b])

        result = compute_alert_extent([severity])

        assert result.array[0, 0] == 60.0

    def test_masks_cells_at_or_below_min_severity(self):
        severity = _make_severity(45.0, [_make_raster(20.0)])

        result = compute_alert_extent([severity])

        assert np.all(result.array == result.nodata)
