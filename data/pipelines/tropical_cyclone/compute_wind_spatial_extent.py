from __future__ import annotations

import numpy as np

from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.tropical_cyclone.constants import MIN_SEVERITY_MS
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalWindSpeedSeverity


def compute_alert_spatial_extent(
    time_interval_severities: list[TimeIntervalWindSpeedSeverity],
) -> RasterData:
    """
    Per-cell max across every ensemble member in every qualifying time bucket - deliberately
    precautionary: shows everywhere any plausible member, at any point in the forecast window,
    put hurricane-force wind. A cyclone forecast is one real, evolving, moving storm, not a static
    library of independent scenarios - unioning across the whole window avoids dropping the
    exposure of an earlier, milder bucket just because a later bucket peaked stronger elsewhere.
    Masked where <= MIN_SEVERITY_MS.
    """
    all_rasters = [
        raster
        for severity in time_interval_severities
        for raster in severity.ensemble_wind_speed_rasters
    ]
    reference = all_rasters[0]
    nodata = reference.nodata

    stacked = np.stack([raster.array for raster in all_rasters])
    envelope = np.ma.masked_equal(stacked, nodata).max(axis=0).filled(nodata)
    footprint = np.where(envelope > MIN_SEVERITY_MS, envelope, nodata)

    return RasterData(
        array=footprint.astype(np.float32),
        transform=reference.transform,
        crs=reference.crs,
        nodata=nodata,
    )
