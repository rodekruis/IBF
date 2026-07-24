from __future__ import annotations

import numpy as np

from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.tropical_cyclone.constants import MIN_SEVERITY_MS
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalSeverity


def compute_alert_extent(
    time_interval_severities: list[TimeIntervalSeverity],
) -> RasterData:
    """
    Picks the qualifying bucket with the highest median wind speed (peak-intensity moment). Within
    that bucket, the footprint is a per-cell max across all members' land-clipped rasters -
    deliberately precautionary: shows everywhere any plausible ensemble member puts hurricane-force
    wind, not just the typical (median) event. Masked where <= MIN_SEVERITY_MS.
    """
    peak_bucket = max(
        time_interval_severities, key=lambda severity: severity.median_wind_speed
    )
    reference = peak_bucket.ensemble_wind_speed_rasters[0]
    nodata = reference.nodata

    stacked = np.stack(
        [raster.array for raster in peak_bucket.ensemble_wind_speed_rasters]
    )
    envelope = np.ma.masked_equal(stacked, nodata).max(axis=0).filled(nodata)
    footprint = np.where(envelope > MIN_SEVERITY_MS, envelope, nodata)

    return RasterData(
        array=footprint.astype(np.float32),
        transform=reference.transform,
        crs=reference.crs,
        nodata=nodata,
    )
