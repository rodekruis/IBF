from __future__ import annotations

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.exposure import clip_raster_to_admin_areas


def determine_spatial_extent(
    station: LocationPoint,
    station_place_codes: list[str],
    admin_areas: AdminAreasSet,
    flood_extent_raster: RasterData,
) -> tuple[RasterData | None, list[str]]:
    """
    Determine spatial extent by filtering station place codes to valid admin areas, clipping the flood extent raster.
    Return a tuple of (clipped_raster_data, place_codes).
    """
    valid_place_codes = [
        place_code
        for place_code in station_place_codes
        if place_code in admin_areas.admin_areas
    ]

    if not valid_place_codes:
        return None, []

    clipped_flood_extent = clip_flood_extent_to_admin_areas(
        place_codes=valid_place_codes,
        admin_areas=admin_areas,
        flood_extent_raster=flood_extent_raster,
        station_code=station.id,
    )

    return clipped_flood_extent, valid_place_codes


def clip_flood_extent_to_admin_areas(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    flood_extent_raster: RasterData,
    station_code: str,
) -> RasterData:
    return clip_raster_to_admin_areas(
        place_codes=place_codes,
        admin_areas=admin_areas,
        raster=flood_extent_raster,
        label=f"station {station_code}",
    )
