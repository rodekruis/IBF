from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.exposure import clip_raster_to_admin_areas
from pipelines.tropical_cyclone.constants import MIN_SEVERITY_MS
from pipelines.tropical_cyclone.extract_forecast import TimeIntervalWindSpeed


@dataclass
class TimeIntervalSeverity:
    time_interval_start: str
    time_interval_end: str
    median_wind_speed: float
    ensemble_wind_speeds: list[float]
    ensemble_wind_speed_rasters: list[RasterData]


def determine_alert(
    wind_speeds: list[TimeIntervalWindSpeed],
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> list[TimeIntervalSeverity]:
    """
    Per time bucket, per member: clip that member's wind-speed raster to the country's own
    admin-area union (the land mask), take its max, excluding nodata cells. Those scalars are the
    RUN severity values; MEDIAN is their median - NOT a per-cell median-then-max, which
    systematically underestimates severity for a high track-position-variance event (max and
    median don't commute). Buckets whose MEDIAN doesn't clear MIN_SEVERITY_MS are dropped. Also
    retains each member's own land-clipped raster (not just its scalar max), for
    compute_wind_extent.py's per-cell-max envelope.
    """
    severities: list[TimeIntervalSeverity] = []

    for bucket in wind_speeds:
        clipped_rasters = [
            clip_raster_to_admin_areas(place_codes, admin_areas, raster)
            for raster in bucket.ensemble_wind_speed_rasters
        ]
        land_masked_maxes = [
            _max_excluding_nodata(raster) for raster in clipped_rasters
        ]
        median_wind_speed = float(np.median(land_masked_maxes))

        if median_wind_speed <= MIN_SEVERITY_MS:
            continue

        severities.append(
            TimeIntervalSeverity(
                time_interval_start=bucket.time_interval_start,
                time_interval_end=bucket.time_interval_end,
                median_wind_speed=median_wind_speed,
                ensemble_wind_speeds=land_masked_maxes,
                ensemble_wind_speed_rasters=clipped_rasters,
            )
        )

    return severities


def _max_excluding_nodata(raster: RasterData) -> float:
    valid = raster.array[raster.array != raster.nodata]
    if valid.size == 0:
        return 0.0
    return float(valid.max())
