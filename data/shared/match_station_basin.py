"""Find unique HydroBASINS basins for GloFAS stations.

For each GloFAS station in a country, finds the highest-level (largest)
HydroBASINS basin that contains only that station among all stations
from the same country.

The main function `match_station_basin()` should be called once per country
with all stations from that country.

Workflow:
  1. Load stations for a specific country
  2. Spatial join stations to basin polygons at each level (4-12)
  3. For each level, count how many stations from the same country fall in each basin
  4. For each station, find the coarsest level where it's the only one in the basin
  5. Return GeoDataFrame with stationCode and corresponding basin geometries

Key outputs:
  - GeoDataFrame with stationCode, basin geometry, basin level, and HYBAS_ID
  - Basins larger than max_basin_area_km2 are excluded from consideration
"""

import glob
import os
from typing import Union

import geopandas as gpd

MIN_LEVEL = 4
MAX_LEVEL = 12
MAX_BASIN_AREA_KM2 = 50_000  # discard basins larger than this


def match_station_basin(
    stations_gdf: gpd.GeoDataFrame,
    basins_path_or_gdf: Union[str, gpd.GeoDataFrame],
    country_code: str,
    min_level: int = 4,
    max_level: int = 12,
    max_basin_area_km2: float = 50_000,
) -> gpd.GeoDataFrame:
    """
    Find the highest-level (largest) HydroBASINS basin for all GloFAS stations in a country.

    Parameters
    ----------
    stations_gdf : gpd.GeoDataFrame
        GeoDataFrame with GloFAS stations from a specific country. Must include:
        - 'stationCode': unique station identifier
        - geometry: Point geometries
    basins_path_or_gdf : str or gpd.GeoDataFrame
        Either:
        - Path to directory containing hydrobasins shapefiles named like
          'hybas_*_lev{level:02d}_*.shp'
        - Single GeoDataFrame with all basin levels (must have 'HYBAS_ID',
          'SUB_AREA', and a level indicator column)
    country_code : str
        Country identifier code (e.g., 'UGA', 'KEN', 'TZA')
    min_level : int, default 4
        Minimum (coarsest) basin level to consider
    max_level : int, default 12
        Maximum (finest) basin level to consider
    max_basin_area_km2 : float, default 50000
        Maximum basin area in km² to consider (larger basins are filtered out)

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with columns:
        - 'stationCode': station identifier
        - geometry: basin polygon geometry
        - 'basin_level': the level at which the basin was found
        - 'HYBAS_ID': HydroBASINS basin ID
    """
    # Validate input
    required_cols = ["stationCode", "geometry"]
    missing = [col for col in required_cols if col not in stations_gdf.columns]
    if missing:
        raise ValueError(f"stations_gdf missing required columns: {missing}")

    # Add country as a temporary column
    stations_with_country = stations_gdf.copy()
    stations_with_country["_country"] = country_code

    # Load basins excluding levels outside the specified range
    if isinstance(basins_path_or_gdf, str):
        basins = _load_basins_from_path(basins_path_or_gdf, min_level, max_level)
    else:
        basins = {max_level: basins_path_or_gdf}  # assume single level for now

    # Reproject all basin levels to match the stations CRS so that spatial
    # joins and the output geometries are all in a consistent coordinate system
    stations_crs = stations_with_country.crs
    basins = {
        level: gdf.to_crs(stations_crs) if gdf.crs != stations_crs else gdf
        for level, gdf in basins.items()
    }

    # Find best basin for each station
    best_basin_per_station = _find_highest_unique_basin(
        stations_with_country, basins, max_basin_area_km2
    )

    # Build result GeoDataFrame with basin geometries
    result_rows = []
    for _, row in stations_gdf.iterrows():
        code = row["stationCode"]
        if code in best_basin_per_station:
            hybas_id, level = best_basin_per_station[code]
            # Get the basin geometry
            basin_gdf = basins[level]
            basin_geom = basin_gdf[basin_gdf["HYBAS_ID"] == hybas_id].geometry.iloc[0]
            result_rows.append(
                {
                    "stationCode": code,
                    "HYBAS_ID": hybas_id,
                    "basin_level": level,
                    "geometry": basin_geom,
                }
            )

    if not result_rows:
        # Return empty GeoDataFrame with correct schema
        return gpd.GeoDataFrame(
            columns=["stationCode", "HYBAS_ID", "basin_level", "geometry"],
            crs=stations_gdf.crs,
        )

    result_gdf = gpd.GeoDataFrame(result_rows, crs=stations_gdf.crs)

    # Print summary
    print(f"Assigned {len(result_gdf)} out of {len(stations_gdf)} stations to basins")
    for lvl in range(min_level, max_level + 1):
        n = (result_gdf["basin_level"] == lvl).sum()
        if n > 0:
            print(f"  Level {lvl:2d}: {n:4d} stations")

    return result_gdf


def _load_basins_from_path(basins_dir: str, min_level: int, max_level: int) -> dict:
    """Load HydroBASINS shapefiles from directory.

    Searches for shapefiles matching the pattern '*lev{level:02d}*.shp'
    for each level from min_level to max_level.

    Parameters
    ----------
    basins_dir : str
        Path to directory containing HydroBASINS shapefiles
    min_level : int
        Minimum basin level to load
    max_level : int
        Maximum basin level to load

    Returns
    -------
    dict
        Dictionary mapping level (int) to GeoDataFrame with basin polygons.
        Each GeoDataFrame must contain 'HYBAS_ID', 'SUB_AREA', and 'geometry'.
    """
    basins = {}
    for level in range(min_level, max_level + 1):
        # Try to find shapefile matching common naming patterns
        pattern = os.path.join(basins_dir, f"*lev{level:02d}*.shp")
        matches = glob.glob(pattern)
        if matches:
            print(f"  Loading level {level} from {matches[0]} …")
            basins[level] = gpd.read_file(matches[0])
        else:
            print(f"  Level {level}: shapefile not found, skipping")
    return basins


def _find_highest_unique_basin(
    stations: gpd.GeoDataFrame,
    basins: dict,
    max_basin_area_km2: float,
) -> dict:
    """Find the coarsest basin level where each station is unique.

    For each station, identifies the largest (coarsest level) basin where
    the station is the only one from its country. Iterates from coarsest
    to finest levels and stops at the first level where the station is alone.

    Algorithm:
      1. Spatial join stations to basins at each level
      2. Count same-country stations per basin at each level
      3. For each station, find coarsest level where count == 1
      4. Return mapping of stationCode to (HYBAS_ID, level)

    Parameters
    ----------
    stations : gpd.GeoDataFrame
        Stations with '_country' column and Point geometries
    basins : dict
        Dictionary mapping level to basin GeoDataFrames (already filtered
        by min/max level during loading)
    max_basin_area_km2 : float
        Maximum basin area to consider (larger basins filtered out)

    Returns
    -------
    dict
        Mapping from stationCode (str) to tuple of (HYBAS_ID, level)
    """
    # Pre-compute: spatial join all stations to each level once
    print("  Spatial-joining stations to basins at each level …")
    joins = {}
    for level, basin_gdf in basins.items():
        # filter out basins that exceed the maximum area
        small_enough = basin_gdf[basin_gdf["SUB_AREA"] <= max_basin_area_km2]
        joined = gpd.sjoin(
            stations,
            small_enough[["HYBAS_ID", "geometry"]],
            how="left",
            predicate="within",
        )
        # keep station code, country, and basin ID
        joins[level] = joined[["stationCode", "_country", "HYBAS_ID"]].copy()
        joins[level]["level"] = level

    # For each level, count same-country stations per basin
    print("  Counting same-country stations per basin at each level …")
    for level in joins:
        df = joins[level]
        counts = (
            df.groupby(["_country", "HYBAS_ID"])
            .size()
            .reset_index(name="n_same_country")
        )
        joins[level] = df.merge(counts, on=["_country", "HYBAS_ID"], how="left")

    # For each station, find the coarsest level where it is alone
    print("  Assigning best level per station …")
    best = {}

    for level in sorted(joins.keys()):
        df = joins[level]
        # stations that are alone in their country+basin at this level
        alone = df[df["n_same_country"] == 1]
        for _, row in alone.iterrows():
            code = row["stationCode"]
            if code not in best:  # only keep the coarsest (first found)
                best[code] = (row["HYBAS_ID"], level)

    return best
