from __future__ import annotations

import logging
from dataclasses import dataclass, field

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
    """Find the HydroSHEDS basin geometry that contains the station point."""
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
    """Return pcodes of admin areas whose geometry intersects with the basin."""
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


def extract_population_for_admin_areas(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    population_raster_path: str,
) -> dict[str, float]:
    """
    Run zonal statistics on a population raster for the given admin areas.
    Returns a dict of pcode -> total population.
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

    with rasterio.open(population_raster_path) as src:
        raster_array = src.read(1)
        transform = src.transform
        nodata = src.nodata if src.nodata is not None else -9999

    stats = zonal_stats(
        geometries,
        raster_array,
        affine=transform,
        stats=["sum"],
        all_touched=True,
        nodata=nodata,
    )

    for pcode, stat in zip(pcodes_ordered, stats):
        value = stat.get("sum")
        population[pcode] = round(value, 0) if value is not None else 0.0

    return population


def determine_admin_area_exposure(
    station: LocationPoint,
    basins_geojson: dict,
    admin_areas: AdminAreasSet,
    population_raster_path: str,
    target_admin_level: int,
) -> AlertExposure | None:
    """
    Determine which admin areas are exposed for a triggered station.
    1. Find the HydroSHEDS basin containing the station
    2. Intersect the basin with admin areas to get affected pcodes
    3. Extract population per affected admin area via zonal statistics
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

    population = extract_population_for_admin_areas(
        place_codes, admin_areas, population_raster_path
    )

    logging.info(
        f"Station {station.id}: {len(place_codes)} admin area(s) exposed, "
        f"total population {sum(population.values()):.0f}"
    )

    return AlertExposure(
        place_codes=place_codes,
        admin_level=target_admin_level,
        population_per_place_code=population,
    )
