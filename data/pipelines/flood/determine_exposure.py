from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import rasterio
from rasterstats import zonal_stats
from shapely.geometry import shape

from pipelines.infra.data_types.admin_area_types import AdminArea, AdminAreasSet
from pipelines.infra.data_types.location_point import LocationPoint


@dataclass
class AlertExposure:
    place_codes: list[str]
    admin_level: int
    population_per_place_code: dict[str, float] = field(default_factory=dict)


def find_basin_for_station(  # TODO: check if this can fetched from the data provider instead of being computed on the fly
    station: LocationPoint,
    basins_geojson: dict,
) -> dict | None:
    """
    Find the HydroSHEDS basin geometry that contains the station point.
    """
    station_point = shape(
        {"type": "Point", "coordinates": [station.lon, station.lat]}
    )
    for feature in basins_geojson.get("features", []):
        basin_geometry = shape(feature["geometry"])
        if basin_geometry.contains(station_point):
            return feature
    return None


def find_admin_areas_in_basin(  # TODO: check if this can fetched from the data provider instead of being computed on the fly
    basin_feature: dict,
    admin_areas: AdminAreasSet,
) -> list[str]:
    """
    Return pcodes of admin areas whose geometry intersects with the basin.
    """
    basin_geometry = shape(basin_feature["geometry"])
    intersecting_pcodes: list[str] = []

    for pcode, admin_area in admin_areas.admin_areas.items():
        admin_geometry = shape(
            {
                "type": admin_area.geometry_type,
                "coordinates": admin_area.coordinates,
            }
        )
        if basin_geometry.intersects(admin_geometry):
            intersecting_pcodes.append(pcode)

    return intersecting_pcodes


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
        pop_nodata = pop_src.nodata if pop_src.nodata is not None else -9999

    with rasterio.open(flood_extent_raster_path) as flood_src:
        flood_array = flood_src.read(1)

    # Mask population: keep only pixels where flood extent has data (> 0)
    masked_population = np.where(flood_array > 0, pop_array, 0.0)

    stats = zonal_stats(
        geometries,
        masked_population,
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
    basins_geojson: dict,
    admin_areas: AdminAreasSet,
    population_raster_path: str,
    flood_extent_raster_path: str | None,
    target_admin_level: int,
) -> AlertExposure | None:
    """
    Determine which admin areas are exposed for a triggered station.
    1. Find the HydroSHEDS basin containing the station
    2. Intersect the basin with admin areas to get affected pcodes
    3. Extract population within the flood extent per affected admin area
    """
    basin_feature = find_basin_for_station(station, basins_geojson)
    if basin_feature is None:
        logging.warning(
            f"No basin found for station {station.id} at "
            f"({station.lat}, {station.lon})"
        )
        return None

    place_codes = find_admin_areas_in_basin(basin_feature, admin_areas)
    if not place_codes:
        logging.warning(
            f"No admin areas intersect with basin for station {station.id}"
        )
        return None

    if flood_extent_raster_path:
        population = extract_population_within_flood_extent(
            place_codes, admin_areas, population_raster_path, flood_extent_raster_path
        )
    else:
        logging.warning(
            f"No flood extent raster for station {station.id}, "
            f"Use population of 0 per admin area"
        )
        population = {pcode: 0.0 for pcode in place_codes}

    return AlertExposure(
        place_codes=place_codes,
        admin_level=target_admin_level,
        population_per_place_code=population,
    )
