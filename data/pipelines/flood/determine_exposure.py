from __future__ import annotations

import logging
import os

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.mask import mask
from rasterio.warp import reproject
from rasterstats import zonal_stats

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.location_point import LocationPoint


def determine_spatial_extent(
    station: LocationPoint,
    station_district_mapping: dict,
    admin_areas: AdminAreasSet,
    flood_extent_raster_path: str,
) -> tuple[str, list[str]]:
    """
    Determine spatial extent by finding mapped place codes for a station, clipping the flood extent raster to admin areas.
    Return a tuple of (clipped_raster_path, place_codes).
    """
    mapped_place_codes = station_district_mapping.get(station.id, [])

    place_codes = [
        place_code
        for place_code in mapped_place_codes
        if place_code in admin_areas.admin_areas
    ]
    
    clipped_flood_extent_raster_path = clip_flood_extent_to_admin_areas(
        place_codes=place_codes,
        admin_areas=admin_areas,
        flood_extent_raster_path=flood_extent_raster_path,
        station_code=station.id,
    )

    return clipped_flood_extent_raster_path, place_codes

def compute_population_exposed(
    population_raster_path: str,
    flood_extent_raster_path: str,
) -> str | None:
    """
    Extract population only within the intersection of admin areas and flood extent.
    For each admin area, masks the population raster with the (binary) flood extent raster
    so only flooded pixels count toward the population sum.
    Returns the path to the output population raster.

    """
    population_raster_stem, _ = os.path.splitext(
        os.path.basename(population_raster_path)
    )
    population_exposed_raster_output_path = os.path.join(
        os.path.dirname(population_raster_path),
        f"{population_raster_stem}_exposed.tif",
    )

    with rasterio.open(population_raster_path) as pop_src:
        pop_array = pop_src.read(1)
        pop_profile = pop_src.profile.copy()
        pop_transform = pop_src.transform
        pop_crs = pop_src.crs

    with rasterio.open(flood_extent_raster_path) as flood_src:
        flood_array_resampled = np.zeros(pop_array.shape, dtype=np.float32)
        reproject(
            source=flood_src.read(1).astype(np.float32),
            destination=flood_array_resampled,
            src_transform=flood_src.transform,
            src_crs=flood_src.crs,
            dst_transform=pop_transform,
            dst_crs=pop_crs,
            resampling=Resampling.nearest,
        )

    binary_flood_extent = (flood_array_resampled > 0).astype(np.uint8)
    population_in_flood_extent = np.where(binary_flood_extent == 1, pop_array, 0.0)

    output_profile = pop_profile.copy()
    output_profile.update(
        dtype=rasterio.float32,
        count=1,
        nodata=0.0,
    )
    with rasterio.open(population_exposed_raster_output_path, "w", **output_profile) as dst:
        dst.write(population_in_flood_extent.astype(np.float32), 1)

    return population_exposed_raster_output_path


# TODO: reusable function for other hazard types, create a common utils across hazards?
def aggregate_population_exposed(
    population_raster_path: str,
    place_codes_exposed: list[str],
    admin_areas: AdminAreasSet,
) -> dict[str, float]:
    """
    Aggregate population exposed within the flood extent per place code.
    """

    population: dict[str, float] = {}

    geometries = []
    pcodes_ordered = []
    for pcode in place_codes_exposed:
        admin_area = admin_areas.admin_areas.get(pcode)
        if admin_area is None:
            continue
        geom = {
            "type": admin_area.geometry_type,
            "coordinates": admin_area.coordinates,
        }
        geometries.append(geom)
        pcodes_ordered.append(pcode)

    if not geometries:
        return population
    
    with rasterio.open(population_raster_path) as pop_src:
        nodata_value = -9999
        pop_nodata = pop_src.nodata if pop_src.nodata is not None else nodata_value

    stats = zonal_stats(
        geometries,
        population_raster_path,
        stats=["sum"],
        all_touched=True,
        nodata=pop_nodata,
    )

    for pcode, stat in zip(pcodes_ordered, stats):
        value = stat.get("sum")
        population[pcode] = round(value, 0) if value is not None else 0.0

    return population


# TODO: to reuse with other hazard types, create a common utils across hazards?
def clip_flood_extent_to_admin_areas(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    flood_extent_raster_path: str,
    station_code: str,
) -> str:
    output_path = os.path.join(
        os.path.dirname(flood_extent_raster_path),
        f"alert_extent_{station_code}.tif",
    )

    geometries: list[dict] = []
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

    with rasterio.open(flood_extent_raster_path) as src:
        profile = src.profile.copy()
        nodata_value = src.nodata

        # Source rasters may carry block size options without tiled output.
        # Drop these creation options to avoid GDAL warnings on write.
        profile.pop("blockxsize", None)
        profile.pop("blockysize", None)
        if profile.get("tiled") is False:
            profile.pop("tiled", None)

        if geometries:
            clipped_data, clipped_transform = mask(
                src,
                geometries,
                crop=True,
                nodata=nodata_value,
                filled=True,
            )
            profile.update(
                height=clipped_data.shape[1],
                width=clipped_data.shape[2],
                transform=clipped_transform,
            )
        else:
            logging.warning(
                f"No admin area geometries to clip for station {station_code}; using full flood extent"
            )
            clipped_data = src.read()

    with rasterio.open(output_path, "w", **profile) as dst:
        dst.write(clipped_data)

    return output_path
