"""Update GloFAS station admin-area mappings from river geometry."""

import argparse
import json
import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen

import fiona
from fiona.transform import transform_geom
from shapely.geometry import MultiPolygon, Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shared.data_helpers import get_seed_data_repo_path

LOGGER = logging.getLogger(__name__)
RIVERS_URL = "https://510ibfsystem.blob.core.windows.net/ibfdatapipelines/river-flood/rivers/rivers.gpkg"
FLOOD_COUNTRIES = ("ETH", "KEN", "MWI", "PHL", "SSD", "UGA", "ZMB")
FLOOD_ADMIN_AREA_LEVELS = {
    "ETH": [2, 3],
    "KEN": [2, 3],
    "MWI": [2, 3],
    "PHL": [2, 3],
    "SSD": [2, 3],
    "UGA": [2, 3, 4],
    "ZMB": [2, 3],
}
STATION_THRESHOLDS_DIRECTORY = Path("hazard/flood/glofas-stations")
ADMIN_AREAS_DIRECTORY = Path("admin-areas/processed")


def load_station_thresholds(filepath: Path) -> list[dict]:
    with filepath.open(encoding="utf-8") as file:
        entries = json.load(file)

    stations: dict[str, dict] = {}
    for entry in entries:
        stations.setdefault(entry["station_code"], entry)
    return list(stations.values())


def load_admin_areas(seed_repo_path: Path, country: str, level: int) -> list[dict]:
    filepath = seed_repo_path / ADMIN_AREAS_DIRECTORY / f"{country}_adm{level}.json"
    with filepath.open(encoding="utf-8") as file:
        return json.load(file)["features"]


def load_river_geometries(
    filepath: Path, country_geometry: BaseGeometry
) -> list[BaseGeometry]:
    with fiona.open(filepath) as source:
        source_crs = source.crs_wkt or source.crs
        geometries = [
            shape(feature["geometry"])
            for feature in source
            if feature["geometry"] is not None
        ]

    if source_crs:
        geometries = [
            shape(transform_geom(source_crs, "EPSG:4326", geometry.__geo_interface__))
            for geometry in geometries
        ]

    return [
        geometry for geometry in geometries if geometry.intersects(country_geometry)
    ]


def get_station_rivers(
    stations: list[dict], river_geometries: list[BaseGeometry]
) -> dict[str, BaseGeometry]:
    if not river_geometries:
        return {}

    dissolved_rivers = unary_union(
        [geometry.buffer(0.0001) for geometry in river_geometries]
    )
    river_parts = (
        list(dissolved_rivers.geoms)
        if isinstance(dissolved_rivers, MultiPolygon)
        else [dissolved_rivers]
    )
    river_index = STRtree(river_parts)
    station_rivers: dict[str, BaseGeometry] = {}
    for station in stations:
        point = Point(station["lon"], station["lat"])
        nearest_index = int(river_index.nearest(point))
        station_rivers[station["station_code"]] = river_parts[nearest_index]
    return station_rivers


def get_station_pcodes(
    country: str,
    stations: list[dict],
    admin_area_levels: list[int],
    admin_areas_by_level: dict[int, list[dict]],
    station_rivers: dict[str, BaseGeometry],
) -> dict[str, dict[str, list[str]]]:
    mappings = {
        station["station_code"]: {str(level): [] for level in admin_area_levels}
        for station in stations
    }
    top_level = admin_area_levels[0]
    for station_code, station_river in station_rivers.items():
        parent_pcodes: set[str] = set()
        for level in admin_area_levels:
            matching_pcodes = []
            is_deepest_level = level == admin_area_levels[-1]
            for feature in admin_areas_by_level[level]:
                properties = feature["properties"]
                if (
                    level != top_level
                    and not is_deepest_level
                    and properties.get(f"ADM{level - 1}_PCODE") not in parent_pcodes
                ):
                    continue
                if (
                    is_deepest_level
                    or level != top_level
                    or station_river.intersects(shape(feature["geometry"]))
                ):
                    if is_deepest_level and not station_river.intersects(
                        shape(feature["geometry"])
                    ):
                        continue
                    matching_pcodes.append(properties[f"ADM{level}_PCODE"])
            pcodes = sorted(set(matching_pcodes))
            mappings[station_code][str(level)] = pcodes
            parent_pcodes = set(pcodes)

    deepest_level = str(admin_area_levels[-1])
    deepest_features = {
        feature["properties"][f"ADM{admin_area_levels[-1]}_PCODE"]: feature
        for feature in admin_areas_by_level[admin_area_levels[-1]]
    }
    station_points = {
        station["station_code"]: Point(station["lon"], station["lat"])
        for station in stations
    }
    area_candidates: dict[str, list[str]] = {}
    for station_code, station_mapping in mappings.items():
        for pcode in station_mapping[deepest_level]:
            area_candidates.setdefault(pcode, []).append(station_code)

    for pcode, candidates in area_candidates.items():
        area_geometry = shape(deepest_features[pcode]["geometry"])
        owner = min(
            candidates,
            key=lambda station_code: (
                station_points[station_code].distance(area_geometry),
                station_code,
            ),
        )
        for station_code in candidates:
            if station_code != owner:
                mappings[station_code][deepest_level].remove(pcode)

    LOGGER.info("Updated station mappings for %s (%d stations)", country, len(mappings))
    return mappings


def update_country(
    country: str,
    seed_repo_path: Path,
    river_filepath: Path,
    skip_missing_input: bool = False,
) -> bool:
    thresholds_filepath = (
        seed_repo_path
        / STATION_THRESHOLDS_DIRECTORY
        / f"{country}_station_thresholds.json"
    )
    if not thresholds_filepath.exists():
        if skip_missing_input:
            LOGGER.warning(
                "Skipping %s because station thresholds are missing: %s",
                country,
                thresholds_filepath,
            )
            return False
        raise FileNotFoundError(thresholds_filepath)

    stations = load_station_thresholds(thresholds_filepath)
    levels = FLOOD_ADMIN_AREA_LEVELS[country]
    admin_areas_by_level = {
        level: load_admin_areas(seed_repo_path, country, level) for level in levels
    }
    country_geometry: BaseGeometry = unary_union(
        [shape(feature["geometry"]) for feature in admin_areas_by_level[levels[0]]]
    )
    river_geometries = load_river_geometries(river_filepath, country_geometry)
    station_rivers = get_station_rivers(stations, river_geometries)
    mappings = get_station_pcodes(
        country, stations, levels, admin_areas_by_level, station_rivers
    )

    for station in stations:
        deepest_level = str(levels[-1])
        station["pcodes"] = {
            deepest_level: mappings[station["station_code"]][deepest_level]
        }
    with thresholds_filepath.open("w", encoding="utf-8") as file:
        json.dump(stations, file, indent=2)
        file.write("\n")
    return True


def download_rivers(filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(RIVERS_URL) as response, NamedTemporaryFile(
        dir=filepath.parent, delete=False
    ) as temporary_file:
        while chunk := response.read(1024 * 1024):
            temporary_file.write(chunk)
        temporary_filepath = Path(temporary_file.name)
    temporary_filepath.replace(filepath)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--country", choices=[*FLOOD_COUNTRIES, "all"], default="all")
    parser.add_argument("--river-file", type=Path)
    parser.add_argument(
        "--download-river-file",
        type=Path,
        default=Path("data/input/rivers.gpkg"),
        help="Download the river file here when --river-file is not supplied.",
    )
    arguments = parser.parse_args()
    river_filepath = arguments.river_file or arguments.download_river_file
    if not river_filepath.exists():
        LOGGER.info("Downloading river data to %s", river_filepath)
        download_rivers(river_filepath)

    seed_repo_path = get_seed_data_repo_path()
    all_countries = arguments.country == "all"
    countries = FLOOD_COUNTRIES if all_countries else (arguments.country,)
    for country in countries:
        update_country(
            country, seed_repo_path, river_filepath, skip_missing_input=all_countries
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
