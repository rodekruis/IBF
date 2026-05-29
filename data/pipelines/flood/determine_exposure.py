from __future__ import annotations

import logging

import numpy as np
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from rasterio.windows import from_bounds as window_from_bounds
from rasterstats import zonal_stats
from shapely.geometry import shape

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.data_types.location_point import LocationPoint


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


# TODO-infra: reusable function for other hazard types, create a common utils across hazards?
def aggregate_population_exposed(
    population_exposed_raster: RasterData,
    place_codes_exposed: list[str],
    admin_areas: AdminAreasSet,
) -> dict[str, float]:
    """
    Aggregate population exposed within the flood extent per place code.
    """

    population: dict[str, float] = {}

    geometries, pcodes_ordered = get_admin_area_geometries(
        place_codes=place_codes_exposed,
        admin_areas=admin_areas,
    )

    if not geometries:
        return population

    stats = zonal_stats(
        geometries,
        population_exposed_raster.array,
        affine=population_exposed_raster.transform,
        stats=["sum"],
        all_touched=False,
        nodata=population_exposed_raster.nodata,
    )

    for pcode, stat in zip(pcodes_ordered, stats):
        value = stat.get("sum")
        population[pcode] = round(value, 0) if value is not None else 0.0

    return population


# TODO-infra: to reuse with other hazard types, create a common utils across hazards?
def clip_flood_extent_to_admin_areas(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    flood_extent_raster: RasterData,
    station_code: str,
) -> RasterData:
    geometries, _ = get_admin_area_geometries(
        place_codes=place_codes,
        admin_areas=admin_areas,
    )

    if not geometries:
        logging.warning(
            f"No admin area geometries to clip for station {station_code}; using full flood extent"
        )
        return flood_extent_raster

    combined_geom = shape(geometries[0])
    for geom in geometries[1:]:
        combined_geom = combined_geom.union(shape(geom))

    minx, miny, maxx, maxy = combined_geom.bounds
    window = window_from_bounds(minx, miny, maxx, maxy, flood_extent_raster.transform)
    row_off = max(int(window.row_off), 0)
    col_off = max(int(window.col_off), 0)
    row_end = min(
        int(window.row_off + window.height), flood_extent_raster.array.shape[0]
    )
    col_end = min(
        int(window.col_off + window.width), flood_extent_raster.array.shape[1]
    )

    cropped_array = flood_extent_raster.array[row_off:row_end, col_off:col_end]
    t = flood_extent_raster.transform
    cropped_transform = from_bounds(
        t.c + col_off * t.a,
        t.f + row_end * t.e,
        t.c + col_end * t.a,
        t.f + row_off * t.e,
        col_end - col_off,
        row_end - row_off,
    )

    mask_array = geometry_mask(
        geometries,
        out_shape=cropped_array.shape,
        transform=cropped_transform,
        invert=True,
    )

    nodata = flood_extent_raster.nodata
    clipped = np.where(mask_array, cropped_array, nodata)

    return RasterData(
        array=clipped.astype(np.float32),
        transform=cropped_transform,
        crs=flood_extent_raster.crs,
        nodata=nodata,
    )


def get_admin_area_geometries(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> tuple[list[dict], list[str]]:
    geometries: list[dict] = []
    place_codes_ordered: list[str] = []

    for place_code in place_codes:
        admin_area = admin_areas.admin_areas.get(place_code)
        if admin_area is None:
            continue
        geometries.append(
            {
                "type": admin_area.geometry_type,
                "coordinates": admin_area.coordinates,
            }
        )
        place_codes_ordered.append(place_code)

    return geometries, place_codes_ordered
