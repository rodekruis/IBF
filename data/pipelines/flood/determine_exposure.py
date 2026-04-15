from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rasterstats import zonal_stats

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.location_point import LocationPoint


@dataclass
class AlertExposure:
    place_codes: list[str]
    admin_level: int
    population_per_place_code: dict[str, float] = field(default_factory=dict)


def get_station_place_codes(
    station: LocationPoint,
    station_district_mapping: dict,
    admin_areas: AdminAreasSet,
) -> list[str]:
    """
    Return mapped place codes for a station, filtered to available target admin areas.
    """
    mapped_place_codes = station_district_mapping.get(station.id)
    if mapped_place_codes is None:
        logging.warning(f"No station mapping found for station {station.id}")
        return []

    if not isinstance(mapped_place_codes, list):
        logging.warning(
            f"Invalid station mapping for station {station.id}: expected list"
        )
        return []

    place_codes = [
        place_code
        for place_code in mapped_place_codes
        if place_code in admin_areas.admin_areas
    ]

    if not place_codes:
        logging.warning(
            f"No mapped admin areas available in target set for station {station.id}"
        )

    return place_codes


def extract_population_within_flood_extent(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    population_raster_path: str,
    flood_extent_raster_path: str,
) -> dict[str, float]:
    """
    Extract population only within the intersection of admin areas and flood extent.
    For each admin area, masks the population raster with the flood extent raster
    so only flooded pixels count toward the population sum.
    Returns a dict of pcode -> exposed population.
    """
    population: dict[str, float] = {}

    geometries = []
    pcodes_ordered = []
    for pcode in place_codes:
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
        pop_array = pop_src.read(1)
        pop_transform = pop_src.transform
        pop_crs = pop_src.crs
        pop_nodata = pop_src.nodata if pop_src.nodata is not None else -9999

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

    stats = zonal_stats(
        geometries,
        population_in_flood_extent,
        affine=pop_transform,
        stats=["sum"],
        all_touched=True,
        nodata=pop_nodata,
    )

    for pcode, stat in zip(pcodes_ordered, stats):
        value = stat.get("sum")
        population[pcode] = round(value, 0) if value is not None else 0.0

    return population


def determine_exposure(
    station: LocationPoint,
    station_district_mapping: dict,
    admin_areas: AdminAreasSet,
    population_raster_path: str,
    flood_extent_raster_path: str,
    target_admin_level: int,
) -> AlertExposure | None:
    """
    Determine which admin areas are exposed for a triggered station.
    1. Read mapped place codes for the station from station_district_mapping
    2. Filter mapped place codes to available target admin areas
    3. Extract population within the flood extent per mapped admin area
    """
    place_codes = get_station_place_codes(
        station=station,
        station_district_mapping=station_district_mapping,
        admin_areas=admin_areas,
    )
    if not place_codes:
        return None

    population = extract_population_within_flood_extent(
        place_codes, admin_areas, population_raster_path, flood_extent_raster_path
    )
    
    return AlertExposure(
        place_codes=place_codes,
        admin_level=target_admin_level,
        population_per_place_code=population,
    )
