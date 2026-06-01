from __future__ import annotations

import logging

import numpy as np
from rasterio.enums import Resampling
from rasterio.warp import reproject

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


def compute_population_exposed(
    population_raster: RasterData,
    flood_extent_raster: RasterData,
) -> RasterData | None:
    """
    Extract population only within the intersection of admin areas and flood extent.
    Masks the population raster with the (binary) flood extent raster
    so only flooded pixels count toward the population sum.
    Returns the exposed population as in-memory raster data.
    """
    pop_array = population_raster.array
    pop_transform = population_raster.transform
    pop_crs = population_raster.crs

    flood_array_resampled = np.zeros(pop_array.shape, dtype=np.float32)
    reproject(
        source=flood_extent_raster.array.astype(np.float32),
        destination=flood_array_resampled,
        src_transform=flood_extent_raster.transform,
        src_crs=flood_extent_raster.crs,
        dst_transform=pop_transform,
        dst_crs=pop_crs,
        resampling=Resampling.nearest,
    )

    binary_flood_extent = (flood_array_resampled > 0).astype(np.uint8)
    population_in_flood_extent = np.where(binary_flood_extent == 1, pop_array, 0.0)

    return RasterData(
        array=population_in_flood_extent.astype(np.float32),
        transform=pop_transform,
        crs=pop_crs,
        nodata=population_raster.nodata,
    )


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
