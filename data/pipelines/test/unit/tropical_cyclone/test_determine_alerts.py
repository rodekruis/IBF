from __future__ import annotations

import numpy as np
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.tropical_cyclone.determine_alerts import (
    _max_excluding_nodata,
    determine_alert,
)
from pipelines.tropical_cyclone.extract_forecast import TimeIntervalWindSpeed
from rasterio.transform import from_origin

# Real GRIB2/IEEE missing-value sentinel used by GEFS wind rasters - a huge positive number,
# so these tests cover the risky case (a broken exclusion would dominate every max), not just
# the mechanism with an arbitrary small placeholder.
_NODATA = 3.4028234663852886e38


def _make_raster(value: float) -> RasterData:
    return RasterData(
        array=np.full((2, 2), value, dtype=np.float32),
        transform=from_origin(0, 2, 1, 1),
        crs="EPSG:4326",
        nodata=_NODATA,
    )


def _build_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_areas={
            "PC001": AdminArea(
                properties=AdminAreaProperties(
                    pcode="PC001", name="PC001", admin_level=1, country_code="PC"
                ),
                geometry_type="Polygon",
                coordinates=[
                    [[0.0, 0.0], [0.0, 2.0], [2.0, 2.0], [2.0, 0.0], [0.0, 0.0]]
                ],
            )
        }
    )


class TestMaxExcludingNodata:
    def test_returns_the_max_valid_value(self):
        raster = _make_raster(10.0)
        raster.array[0, 0] = 25.0
        assert _max_excluding_nodata(raster) == 25.0

    def test_excludes_nodata_from_the_max(self):
        raster = _make_raster(_NODATA)
        raster.array[0, 0] = 12.0
        assert _max_excluding_nodata(raster) == 12.0

    def test_returns_zero_when_every_cell_is_nodata(self):
        raster = _make_raster(_NODATA)
        assert _max_excluding_nodata(raster) == 0.0


class TestDetermineAlert:
    def test_median_is_taken_over_per_member_maxima(self):
        wind_speeds = [
            TimeIntervalWindSpeed(
                time_interval_start="2026-07-10T00:00:00Z",
                time_interval_end="2026-07-10T03:00:00Z",
                ensemble_wind_speed_rasters=[
                    _make_raster(30.0),
                    _make_raster(40.0),
                    _make_raster(50.0),
                ],
            )
        ]
        [severity] = determine_alert(wind_speeds, ["PC001"], _build_admin_areas())
        assert severity.ensemble_wind_speeds == [30.0, 40.0, 50.0]
        assert severity.median_wind_speed == 40.0

    def test_drops_buckets_at_or_below_min_severity(self):
        wind_speeds = [
            TimeIntervalWindSpeed(
                time_interval_start="2026-07-10T00:00:00Z",
                time_interval_end="2026-07-10T03:00:00Z",
                ensemble_wind_speed_rasters=[_make_raster(10.0), _make_raster(20.0)],
            )
        ]
        assert determine_alert(wind_speeds, ["PC001"], _build_admin_areas()) == []

    def test_keeps_only_qualifying_buckets_among_several(self):
        wind_speeds = [
            TimeIntervalWindSpeed(
                time_interval_start="2026-07-10T00:00:00Z",
                time_interval_end="2026-07-10T03:00:00Z",
                ensemble_wind_speed_rasters=[_make_raster(10.0)],
            ),
            TimeIntervalWindSpeed(
                time_interval_start="2026-07-10T03:00:00Z",
                time_interval_end="2026-07-10T06:00:00Z",
                ensemble_wind_speed_rasters=[_make_raster(40.0)],
            ),
        ]
        result = determine_alert(wind_speeds, ["PC001"], _build_admin_areas())
        assert [severity.time_interval_start for severity in result] == [
            "2026-07-10T03:00:00Z"
        ]
