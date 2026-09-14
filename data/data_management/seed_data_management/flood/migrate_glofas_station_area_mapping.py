"""Transfer station mappings from source admin geometries to target geometries."""

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, UTC
from pathlib import Path
from typing import cast

from data_management.seed_data_management.admin_areas.admin_area_dataset_helpers import (
    ADMIN_AREAS_DIRECTORY,
    DEFAULT_SEED_REPOSITORY_URL,
    get_feature_geometry,
    get_git_revision,
    get_pcode,
    load_admin_features,
    load_json,
    union_geometries,
)
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

FLOOD_DEEPEST_ADMIN_LEVELS = {
    "ETH": 3,
    "KEN": 3,
    "MWI": 3,
    "PHL": 3,
    "SSD": 3,
    "UGA": 4,
    "ZMB": 4,
}
OLD_STATION_MAPPING_LEVELS = {
    "ETH": 3,
    "KEN": 3,
    "MWI": 3,
    "PHL": 3,
    "SSD": 3,
    "UGA": 4,
    "ZMB": 3,  # Set this different from the target level if applicable. In the latest implementation, ZMB was the only example of this.
}
STATION_THRESHOLDS_DIRECTORY = Path("hazard/flood/glofas-stations")
DEFAULT_MINIMUM_NEW_AREA_OVERLAP = 0.25
DEFAULT_MINIMUM_OLD_FOOTPRINT_COVERAGE = 0.9


@dataclass(frozen=True)
class AreaOverlap:
    pcode: str
    overlap_area: float
    overlap_of_new_area: float
    overlap_of_old_footprint: float


def load_unique_stations(filepath: Path) -> dict[str, dict]:
    stations: dict[str, dict] = {}
    for entry in cast(list[dict], load_json(filepath)):
        stations.setdefault(entry["station_code"], entry)
    return stations


def find_overlapping_new_areas(
    old_footprint: BaseGeometry,
    new_features: list[dict],
    deepest_level: int,
    minimum_new_area_overlap: float,
) -> list[AreaOverlap]:
    old_area = old_footprint.area
    geometries = [get_feature_geometry(feature) for feature in new_features]
    tree = STRtree(geometries)
    overlaps: list[AreaOverlap] = []
    for index in tree.query(old_footprint):
        new_geometry = geometries[int(index)]
        if new_geometry.area == 0:
            continue
        overlap_area = old_footprint.intersection(new_geometry).area
        overlap_of_new_area = overlap_area / new_geometry.area
        if overlap_area == 0 or overlap_of_new_area < minimum_new_area_overlap:
            continue
        overlaps.append(
            AreaOverlap(
                pcode=get_pcode(new_features[int(index)], deepest_level),
                overlap_area=overlap_area,
                overlap_of_new_area=overlap_of_new_area,
                overlap_of_old_footprint=(overlap_area / old_area if old_area else 0),
            )
        )
    return sorted(overlaps, key=lambda overlap: overlap.pcode)


def migrate_country(
    old_seed_repo_path: Path,
    new_seed_repo_path: Path,
    output_directory: Path,
    country: str,
    minimum_new_area_overlap: float,
    minimum_old_footprint_coverage: float,
) -> list[dict]:
    old_level = OLD_STATION_MAPPING_LEVELS[country]
    new_level = FLOOD_DEEPEST_ADMIN_LEVELS[country]
    old_station_path = (
        old_seed_repo_path
        / STATION_THRESHOLDS_DIRECTORY
        / f"{country}_station_thresholds.json"
    )
    old_features = load_admin_features(old_seed_repo_path, country, old_level)
    new_features = load_admin_features(new_seed_repo_path, country, new_level)
    old_features_by_pcode = {
        get_pcode(feature, old_level): feature for feature in old_features
    }
    new_features_by_pcode = {
        get_pcode(feature, new_level): feature for feature in new_features
    }
    old_stations = load_unique_stations(old_station_path)
    migrated_stations: list[dict] = []
    report: list[dict] = []

    for station_code, station in sorted(old_stations.items()):
        old_pcodes = station.get("pcodes", {}).get(str(old_level), [])
        old_footprint = union_geometries(
            [
                get_feature_geometry(old_features_by_pcode[pcode])
                for pcode in old_pcodes
                if pcode in old_features_by_pcode
            ]
        )
        if old_footprint is None:
            migrated_station = dict(station)
            migrated_station["pcodes"] = {str(new_level): []}
            migrated_stations.append(migrated_station)
            report.append(
                {
                    "station_code": station_code,
                    "old_admin_level": old_level,
                    "new_admin_level": new_level,
                    "old_pcodes": old_pcodes,
                    "new_pcodes": [],
                    "old_footprint_area": 0,
                    "new_overlap_area": 0,
                    "old_footprint_coverage": 0,
                    "overlaps": [],
                    "review": "No source deepest-level footprint was available.",
                }
            )
            continue

        overlaps = find_overlapping_new_areas(
            old_footprint,
            new_features,
            new_level,
            minimum_new_area_overlap,
        )
        new_pcodes = [overlap.pcode for overlap in overlaps]
        new_footprint = union_geometries(
            [get_feature_geometry(new_features_by_pcode[pcode]) for pcode in new_pcodes]
        )
        migrated_station = dict(station)
        migrated_station["pcodes"] = {str(new_level): new_pcodes}
        migrated_stations.append(migrated_station)
        overlap_area = (
            old_footprint.intersection(new_footprint).area
            if new_footprint is not None
            else 0
        )
        old_footprint_coverage = (
            overlap_area / old_footprint.area if old_footprint.area else 0
        )
        report.append(
            {
                "station_code": station_code,
                "old_admin_level": old_level,
                "new_admin_level": new_level,
                "old_pcodes": old_pcodes,
                "new_pcodes": new_pcodes,
                "old_footprint_area": old_footprint.area,
                "new_overlap_area": overlap_area,
                "old_footprint_coverage": old_footprint_coverage,
                "meets_old_footprint_coverage": old_footprint_coverage
                >= minimum_old_footprint_coverage,
                "review": (
                    f"Combined target footprint covers only "
                    f"{old_footprint_coverage:.1%} of the source footprint."
                    if old_footprint_coverage < minimum_old_footprint_coverage
                    else None
                ),
                "overlaps": [asdict(overlap) for overlap in overlaps],
            }
        )

    add_shared_new_pcodes(report, new_level)

    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / f"{country}_station_thresholds.json").write_text(
        json.dumps(migrated_stations, indent=2) + "\n", encoding="utf-8"
    )
    (output_directory / f"{country}_station_area_migration.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return report


# Each deepest-level area should drain to a single station, but the per-station
# overlap above cannot see the other stations' claims.
def add_shared_new_pcodes(report: list[dict], new_level: int) -> None:
    stations_by_pcode: dict[str, list[str]] = {}
    for entry in report:
        for pcode in entry["new_pcodes"]:
            stations_by_pcode.setdefault(pcode, []).append(entry["station_code"])

    for entry in report:
        shared = {
            pcode: [
                station_code
                for station_code in stations_by_pcode[pcode]
                if station_code != entry["station_code"]
            ]
            for pcode in entry["new_pcodes"]
            if len(stations_by_pcode[pcode]) > 1
        }
        entry["shared_new_pcodes"] = shared
        if not shared:
            continue
        shared_review = (
            f"{len(shared)} adm{new_level} areas are also claimed by another station."
        )
        entry["review"] = (
            f"{entry['review']} {shared_review}" if entry["review"] else shared_review
        )


def write_manifest(
    output_directory: Path,
    old_seed_repository_url: str,
    old_seed_revision: str,
    new_seed_repository_url: str,
    new_seed_revision: str,
    minimum_new_area_overlap: float,
    minimum_old_footprint_coverage: float,
    country: str,
) -> None:
    old_level = OLD_STATION_MAPPING_LEVELS[country]
    new_level = FLOOD_DEEPEST_ADMIN_LEVELS[country]
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "method": "spatial-source-footprint-to-target-admin-area-overlap",
        "minimumNewAreaOverlap": minimum_new_area_overlap,
        "minimumOldFootprintCoverage": minimum_old_footprint_coverage,
        "oldSource": {
            "repository": old_seed_repository_url,
            "revision": old_seed_revision,
            "stationThresholdPath": str(
                STATION_THRESHOLDS_DIRECTORY / f"{country}_station_thresholds.json"
            ),
            "adminAreaPath": str(
                ADMIN_AREAS_DIRECTORY / f"{country}_adm{old_level}.json"
            ),
        },
        "newSource": {
            "repository": new_seed_repository_url,
            "revision": new_seed_revision,
            "adminAreaPath": str(
                ADMIN_AREAS_DIRECTORY / f"{country}_adm{new_level}.json"
            ),
        },
        "output": {
            "stationThresholdPath": f"{country}_station_thresholds.json",
            "reportPath": f"{country}_station_area_migration.json",
        },
    }
    (output_directory / f"{country}_migration_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--old-seed-repo", type=Path, required=True)
    parser.add_argument("--new-seed-repo", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument(
        "--old-seed-repository-url", default=DEFAULT_SEED_REPOSITORY_URL
    )
    parser.add_argument("--old-seed-revision", required=True)
    parser.add_argument(
        "--new-seed-repository-url", default=DEFAULT_SEED_REPOSITORY_URL
    )
    parser.add_argument("--new-seed-revision")
    parser.add_argument(
        "--country", choices=[*FLOOD_DEEPEST_ADMIN_LEVELS, "all"], default="all"
    )
    parser.add_argument(
        "--minimum-new-area-overlap",
        type=float,
        default=DEFAULT_MINIMUM_NEW_AREA_OVERLAP,
        help="Minimum fraction of a target area covered by the source footprint.",
    )
    parser.add_argument(
        "--minimum-old-footprint-coverage",
        type=float,
        default=DEFAULT_MINIMUM_OLD_FOOTPRINT_COVERAGE,
        help="Minimum combined coverage of the source station footprint.",
    )
    arguments = parser.parse_args()
    new_seed_revision = arguments.new_seed_revision or get_git_revision(
        arguments.new_seed_repo
    )
    if not new_seed_revision:
        parser.error(
            "--new-seed-revision is required when --new-seed-repo is not a Git checkout"
        )
    countries = (
        FLOOD_DEEPEST_ADMIN_LEVELS
        if arguments.country == "all"
        else {arguments.country: FLOOD_DEEPEST_ADMIN_LEVELS[arguments.country]}
    )
    for country in countries:
        migrate_country(
            arguments.old_seed_repo,
            arguments.new_seed_repo,
            arguments.output_directory,
            country,
            arguments.minimum_new_area_overlap,
            arguments.minimum_old_footprint_coverage,
        )
        write_manifest(
            arguments.output_directory,
            arguments.old_seed_repository_url,
            arguments.old_seed_revision,
            arguments.new_seed_repository_url,
            new_seed_revision,
            arguments.minimum_new_area_overlap,
            arguments.minimum_old_footprint_coverage,
            country,
        )


if __name__ == "__main__":
    main()
