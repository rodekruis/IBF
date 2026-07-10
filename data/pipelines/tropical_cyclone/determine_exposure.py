from __future__ import annotations

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.exposure import clip_raster_to_admin_areas


def determine_spatial_extent(
    wind_extent: RasterData,
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> RasterData | None:
    """
    Thin wrapper over infra.utils.exposure.clip_raster_to_admin_areas - TC's extent is
    whole-country, so unlike flood's per-station equivalent, there's no separate station-place-code
    config to filter for staleness against `admin_areas`; `place_codes` here is always derived
    directly from the same `admin_areas` passed in, so it's always valid. Re-clipping `wind_extent`
    (already land-clipped once per member in determine_alerts.py) to the same place codes is a
    no-op in practice, kept for API-shape parity with flood's pattern.
    """
    if not place_codes:
        return None

    return clip_raster_to_admin_areas(
        place_codes=place_codes,
        admin_areas=admin_areas,
        raster=wind_extent,
    )
