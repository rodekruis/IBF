from __future__ import annotations

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.exposure import clip_raster_to_admin_areas


def clip_wind_spatial_extent_to_admin_areas(
    wind_spatial_extent: RasterData,
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> RasterData | None:
    """Clips the wind spatial extent raster to the given admin areas, or None if no place codes.

    Uses the same all_touched clip as determine_severities: with a centre-only clip an alert
    driven by a sub-cell admin area (a small island group) keeps its severity but loses every
    above-threshold cell here, reporting zero population exposed.
    """
    if not place_codes:
        return None

    return clip_raster_to_admin_areas(
        place_codes=place_codes,
        admin_areas=admin_areas,
        raster=wind_spatial_extent,
        all_touched=True,
    )
