"""Transfer drought region mappings from source admin geometries to target geometries."""

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, UTC
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_dataset_helpers import (
    ADMIN_AREAS_DIRECTORY,
    DEFAULT_SEED_REPOSITORY_URL,
    get_area_name,
    get_feature_geometry,
    get_git_revision,
    get_pcode,
    load_admin_features,
    union_geometries,
)
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

DROUGHT_REGION_ADMIN_LEVELS = {"ETH": 2, "UGA": 2}
OLD_DROUGHT_REGION_LEVELS = {"ETH": 2, "UGA": 2}
DEFAULT_ALERT_CONFIGS_FILE = Path(
    "../services/api-service/src/seed/seed-data/seed-alert-configs.const.ts"
)
DEFAULT_MINIMUM_NEW_AREA_OVERLAP = 0.25
DEFAULT_MINIMUM_OLD_FOOTPRINT_COVERAGE = 0.9

DROUGHT_CONFIG_PATTERN = re.compile(
    r"countryCodeIso3:\s*'(?P<country>\w+)',\s*"
    r"regionName:\s*'(?P<region>[^']+)',\s*"
    r"placeCodes:\s*\[(?P<place_codes>[^\]]*)\]",
    re.DOTALL,
)
PLACE_CODE_PATTERN = re.compile(r"'([A-Za-z0-9]+)'")


@dataclass(frozen=True)
class DroughtRegion:
    region_name: str
    place_codes: list[str]


@dataclass(frozen=True)
class RegionOverlap:
    region_name: str
    overlap_area: float
    overlap_of_new_area: float


def migrate_country(
    old_seed_repo_path: Path,
    new_seed_repo_path: Path,
    output_directory: Path,
    country: str,
    regions: list[DroughtRegion],
    minimum_new_area_overlap: float,
    minimum_old_footprint_coverage: float,
) -> dict:
    old_level = OLD_DROUGHT_REGION_LEVELS[country]
    new_level = DROUGHT_REGION_ADMIN_LEVELS[country]
    old_features = load_admin_features(old_seed_repo_path, country, old_level)
    new_features = load_admin_features(new_seed_repo_path, country, new_level)
    old_features_by_pcode = {
        get_pcode(feature, old_level): feature for feature in old_features
    }
    new_geometries = [get_feature_geometry(feature) for feature in new_features]
    new_geometries_by_pcode = {
        get_pcode(feature, new_level): geometry
        for feature, geometry in zip(new_features, new_geometries)
    }

    old_footprints = build_old_region_footprints(
        regions, old_features_by_pcode, old_level
    )
    candidates_by_pcode = find_region_candidates_per_new_area(
        old_footprints,
        new_features,
        new_geometries,
        new_level,
        minimum_new_area_overlap,
    )
    place_codes_by_region, contested_areas = assign_new_areas_to_regions(
        regions, candidates_by_pcode
    )

    migrated_regions = [
        {
            "regionName": region.region_name,
            "placeCodes": place_codes_by_region[region.region_name],
        }
        for region in regions
    ]
    report = {
        "countryCodeIso3": country,
        "oldAdminLevel": old_level,
        "newAdminLevel": new_level,
        "regions": [
            build_region_report(
                region=region,
                old_footprint=old_footprints.get(region.region_name),
                old_features_by_pcode=old_features_by_pcode,
                new_place_codes=place_codes_by_region[region.region_name],
                new_geometries_by_pcode=new_geometries_by_pcode,
                minimum_old_footprint_coverage=minimum_old_footprint_coverage,
            )
            for region in regions
        ],
        "contestedAreas": contested_areas,
        "unassignedAreas": find_unassigned_new_areas(
            new_features, new_level, candidates_by_pcode
        ),
    }

    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / f"{country}_drought_regions.json").write_text(
        json.dumps(
            {
                "countryCodeIso3": country,
                "adminLevel": new_level,
                "regions": migrated_regions,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (output_directory / f"{country}_drought_region_migration.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return report


def load_drought_regions(
    alert_configs_file: Path,
) -> dict[str, list[DroughtRegion]]:
    source = alert_configs_file.read_text(encoding="utf-8")
    regions_by_country: dict[str, list[DroughtRegion]] = {}
    for match in DROUGHT_CONFIG_PATTERN.finditer(source):
        place_codes = PLACE_CODE_PATTERN.findall(match.group("place_codes"))
        if not place_codes:
            continue
        regions_by_country.setdefault(match.group("country"), []).append(
            DroughtRegion(
                region_name=match.group("region"),
                place_codes=place_codes,
            )
        )
    return regions_by_country


def build_old_region_footprints(
    regions: list[DroughtRegion],
    old_features_by_pcode: dict[str, dict],
    old_level: int,
) -> dict[str, BaseGeometry]:
    footprints: dict[str, BaseGeometry] = {}
    for region in regions:
        footprint = union_geometries(
            [
                get_feature_geometry(old_features_by_pcode[place_code])
                for place_code in region.place_codes
                if place_code in old_features_by_pcode
            ]
        )
        if footprint is not None:
            footprints[region.region_name] = footprint
    return footprints


def find_region_candidates_per_new_area(
    old_footprints: dict[str, BaseGeometry],
    new_features: list[dict],
    new_geometries: list[BaseGeometry],
    new_level: int,
    minimum_new_area_overlap: float,
) -> dict[str, list[RegionOverlap]]:
    tree = STRtree(new_geometries)
    candidates: dict[str, list[RegionOverlap]] = {}
    for region_name, old_footprint in old_footprints.items():
        for index in tree.query(old_footprint):
            new_geometry = new_geometries[int(index)]
            if new_geometry.area == 0:
                continue
            overlap_area = old_footprint.intersection(new_geometry).area
            overlap_of_new_area = overlap_area / new_geometry.area
            if overlap_area == 0 or overlap_of_new_area < minimum_new_area_overlap:
                continue
            place_code = get_pcode(new_features[int(index)], new_level)
            candidates.setdefault(place_code, []).append(
                RegionOverlap(
                    region_name=region_name,
                    overlap_area=overlap_area,
                    overlap_of_new_area=overlap_of_new_area,
                )
            )
    return candidates


def assign_new_areas_to_regions(
    regions: list[DroughtRegion],
    candidates_by_pcode: dict[str, list[RegionOverlap]],
) -> tuple[dict[str, list[str]], list[dict]]:
    place_codes_by_region: dict[str, list[str]] = {
        region.region_name: [] for region in regions
    }
    contested_areas: list[dict] = []
    for place_code, candidates in sorted(candidates_by_pcode.items()):
        ranked = sorted(
            candidates, key=lambda candidate: candidate.overlap_area, reverse=True
        )
        place_codes_by_region[ranked[0].region_name].append(place_code)
        if len(ranked) > 1:
            contested_areas.append(
                {
                    "placeCode": place_code,
                    "assignedRegion": ranked[0].region_name,
                    "candidates": [asdict(candidate) for candidate in ranked],
                }
            )
    for place_codes in place_codes_by_region.values():
        place_codes.sort()
    return place_codes_by_region, contested_areas


def build_region_report(
    region: DroughtRegion,
    old_footprint: BaseGeometry | None,
    old_features_by_pcode: dict[str, dict],
    new_place_codes: list[str],
    new_geometries_by_pcode: dict[str, BaseGeometry],
    minimum_old_footprint_coverage: float,
) -> dict:
    old_place_codes_not_found = sorted(
        set(region.place_codes) - set(old_features_by_pcode)
    )
    if old_footprint is None:
        return {
            "regionName": region.region_name,
            "oldPlaceCodes": region.place_codes,
            "oldPlaceCodesNotFound": old_place_codes_not_found,
            "newPlaceCodes": [],
            "oldFootprintArea": 0,
            "newOverlapArea": 0,
            "oldFootprintCoverage": 0,
            "meetsOldFootprintCoverage": False,
            "review": "No source footprint was available for this region.",
        }
    new_footprint = union_geometries(
        [new_geometries_by_pcode[place_code] for place_code in new_place_codes]
    )
    overlap_area = (
        old_footprint.intersection(new_footprint).area
        if new_footprint is not None
        else 0
    )
    old_footprint_coverage = (
        overlap_area / old_footprint.area if old_footprint.area else 0
    )
    return {
        "regionName": region.region_name,
        "oldPlaceCodes": region.place_codes,
        "oldPlaceCodesNotFound": old_place_codes_not_found,
        "newPlaceCodes": new_place_codes,
        "oldFootprintArea": old_footprint.area,
        "newOverlapArea": overlap_area,
        "oldFootprintCoverage": old_footprint_coverage,
        "meetsOldFootprintCoverage": old_footprint_coverage
        >= minimum_old_footprint_coverage,
        "review": (
            f"Combined target footprint covers only "
            f"{old_footprint_coverage:.1%} of the source footprint."
            if old_footprint_coverage < minimum_old_footprint_coverage
            else None
        ),
    }


def find_unassigned_new_areas(
    new_features: list[dict],
    new_level: int,
    candidates_by_pcode: dict[str, list[RegionOverlap]],
) -> list[dict]:
    return sorted(
        (
            {
                "placeCode": get_pcode(feature, new_level),
                "name": get_area_name(feature, new_level),
            }
            for feature in new_features
            if get_pcode(feature, new_level) not in candidates_by_pcode
        ),
        key=lambda area: area["placeCode"],
    )


def write_manifest(
    output_directory: Path,
    old_seed_repository_url: str,
    old_seed_revision: str,
    new_seed_repository_url: str,
    new_seed_revision: str,
    alert_configs_file: Path,
    minimum_new_area_overlap: float,
    minimum_old_footprint_coverage: float,
    country: str,
) -> None:
    old_level = OLD_DROUGHT_REGION_LEVELS[country]
    new_level = DROUGHT_REGION_ADMIN_LEVELS[country]
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "method": "spatial-source-region-footprint-to-target-admin-area-overlap",
        "minimumNewAreaOverlap": minimum_new_area_overlap,
        "minimumOldFootprintCoverage": minimum_old_footprint_coverage,
        "oldSource": {
            "repository": old_seed_repository_url,
            "revision": old_seed_revision,
            "alertConfigsPath": str(alert_configs_file),
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
            "droughtRegionsPath": f"{country}_drought_regions.json",
            "reportPath": f"{country}_drought_region_migration.json",
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
        "--alert-configs-file", type=Path, default=DEFAULT_ALERT_CONFIGS_FILE
    )
    parser.add_argument(
        "--old-seed-repository-url", default=DEFAULT_SEED_REPOSITORY_URL
    )
    parser.add_argument("--old-seed-revision", required=True)
    parser.add_argument(
        "--new-seed-repository-url", default=DEFAULT_SEED_REPOSITORY_URL
    )
    parser.add_argument("--new-seed-revision")
    parser.add_argument(
        "--country", choices=[*DROUGHT_REGION_ADMIN_LEVELS, "all"], default="all"
    )
    parser.add_argument(
        "--minimum-new-area-overlap",
        type=float,
        default=DEFAULT_MINIMUM_NEW_AREA_OVERLAP,
        help="Minimum fraction of a target area covered by a source region footprint.",
    )
    parser.add_argument(
        "--minimum-old-footprint-coverage",
        type=float,
        default=DEFAULT_MINIMUM_OLD_FOOTPRINT_COVERAGE,
        help="Minimum combined coverage of the source region footprint.",
    )
    arguments = parser.parse_args()
    new_seed_revision = arguments.new_seed_revision or get_git_revision(
        arguments.new_seed_repo
    )
    if not new_seed_revision:
        parser.error(
            "--new-seed-revision is required when --new-seed-repo is not a Git checkout"
        )
    regions_by_country = load_drought_regions(arguments.alert_configs_file)
    countries = (
        list(DROUGHT_REGION_ADMIN_LEVELS)
        if arguments.country == "all"
        else [arguments.country]
    )
    for country in countries:
        regions = regions_by_country.get(country)
        if not regions:
            parser.error(
                f"No drought regions with place codes found for {country} "
                f"in {arguments.alert_configs_file}"
            )
        migrate_country(
            arguments.old_seed_repo,
            arguments.new_seed_repo,
            arguments.output_directory,
            country,
            regions,
            arguments.minimum_new_area_overlap,
            arguments.minimum_old_footprint_coverage,
        )
        write_manifest(
            arguments.output_directory,
            arguments.old_seed_repository_url,
            arguments.old_seed_revision,
            arguments.new_seed_repository_url,
            new_seed_revision,
            arguments.alert_configs_file,
            arguments.minimum_new_area_overlap,
            arguments.minimum_old_footprint_coverage,
            country,
        )


if __name__ == "__main__":
    main()
