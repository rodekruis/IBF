"""
Clean all processed admin area GeoJSON files.

Loads each `<COUNTRY>_adm<level>.json` file from the seed-data
admin-areas/processed directory, normalizes any Polygon geometries to
MultiPolygon (also fixing incorrectly-nested polygons coming from IBF v1),
fills in any missing parent PCODE/name fields (using PCODE-prefix matching
across admin levels for the same country), and writes the cleaned
FeatureCollection back to disk.
"""

import glob
import json
import os
import re
from collections import defaultdict
from pathlib import Path

from data_management.seed_data_management.populate_ibf_v1_admin_area_parents import (
    dict_to_feature_collection,
    feature_collection_to_dict,
    get_name,
    get_name_key,
    get_pcode,
    get_pcode_key,
    set_name,
    set_pcode,
)
from data_management.utils.admin_area_geojson import AdminAreaFeatureCollection
from data_management.utils.geo_utils import normalize_polygon_to_multipolygon
from shared.data_helpers import get_seed_data_repo_path

BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "processed"
FILE_PATTERN = "*.json"


def clean_admin_area_file(json_file: str) -> None:
    basename = os.path.basename(json_file)

    with open(json_file, "r", encoding="utf-8") as f:
        geojson_data = json.load(f)

    if geojson_data.get("type") != "FeatureCollection":
        print(f"ERROR: {basename} is not a FeatureCollection, skipping.")
        return

    features = geojson_data.get("features", [])
    if not features:
        print(f"WARNING: No features in {basename}, skipping.")
        return

    normalized_count = 0
    for feature in features:
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue

        original_type = geometry.get("type")
        normalized = normalize_polygon_to_multipolygon(geometry)
        if normalized is not geometry or normalized.get("type") != original_type:
            feature["geometry"] = normalized
            normalized_count += 1

    merged_count = 0
    if re.match(r"^.+_adm0\.json$", basename):
        original_count = len(features)
        features = merge_adm0_duplicate_features(features)
        geojson_data["features"] = features
        merged_count = original_count - len(features)

    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, indent=2, ensure_ascii=False)

    merged_msg = f", {merged_count} duplicates merged" if merged_count else ""
    print(
        f"Cleaned {basename}: {len(features)} features "
        f"({normalized_count} geometries normalized{merged_msg})"
    )


def merge_adm0_duplicate_features(features: list[dict]) -> list[dict]:
    """Merge adm0 features sharing the same ADM0_PCODE into one MultiPolygon.

    Some country adm0 files (e.g. CHN, IND, PAK) contain multiple features with
    identical properties but different geometry pieces. Combine their geometry
    coordinates into a single MultiPolygon feature per PCODE.
    """
    grouped: dict[str, list[dict]] = defaultdict(list)
    order: list[str] = []
    for feature in features:
        pcode = (feature.get("properties") or {}).get("ADM0_PCODE")
        key = pcode if pcode else f"__no_pcode_{id(feature)}"
        if key not in grouped:
            order.append(key)
        grouped[key].append(feature)

    merged_features: list[dict] = []
    for key in order:
        group = grouped[key]
        if len(group) == 1:
            merged_features.append(group[0])
            continue

        combined_coords: list = []
        for feature in group:
            geometry = feature.get("geometry") or {}
            if geometry.get("type") == "MultiPolygon":
                combined_coords.extend(geometry.get("coordinates") or [])
            elif geometry.get("type") == "Polygon":
                combined_coords.append(geometry.get("coordinates"))

        merged = dict(group[0])
        merged["geometry"] = {
            "type": "MultiPolygon",
            "coordinates": combined_coords,
        }
        merged_features.append(merged)

    return merged_features


def clean_all_processed_admin_areas() -> None:
    json_pattern = os.path.join(INPUT_DIR, FILE_PATTERN)
    json_files = sorted(glob.glob(json_pattern))

    print(f"Found {len(json_files)} GeoJSON files to clean.")

    for json_file in json_files:
        clean_admin_area_file(json_file)

    populate_all_missing_parents(json_files)


def populate_all_missing_parents(json_files: list[str]) -> None:
    """Group files by country, fill missing parent PCODE/name fields, save."""
    country_levels: dict[str, list[int]] = defaultdict(list)
    for json_file in json_files:
        match = re.match(r"^(.+)_adm(\d+)\.json$", os.path.basename(json_file))
        if match:
            country_levels[match.group(1)].append(int(match.group(2)))

    print(f"\nPopulating missing parents for {len(country_levels)} countries...")
    for country, levels in country_levels.items():
        levels.sort()
        admin_data: dict[int, AdminAreaFeatureCollection] = {}
        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            with open(filepath, "r", encoding="utf-8") as f:
                admin_data[level] = dict_to_feature_collection(json.load(f))

        filled = populate_missing_parents(admin_data, levels)
        if not filled:
            continue

        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(
                    feature_collection_to_dict(admin_data[level]),
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        print(f"  {country}: filled {filled} missing parent field(s)")


def populate_missing_parents(
    admin_data: dict[int, AdminAreaFeatureCollection],
    admin_levels: list[int],
) -> int:
    """Fill in missing parent PCODE/name on child features via PCODE-prefix match.

    Only writes fields that are currently missing on the child; existing values
    are preserved.
    """
    filled = 0
    for parent_level in admin_levels:
        for parent_feature in admin_data[parent_level].features:
            parent_props = parent_feature.properties
            parent_pcode = get_pcode(parent_props, parent_level) or ""
            parent_name = get_name(parent_props, parent_level) or ""
            if not parent_pcode:
                continue

            for child_level in admin_levels:
                if child_level <= parent_level:
                    continue
                for child_feature in admin_data[child_level].features:
                    child_props = child_feature.properties
                    child_pcode = get_pcode(child_props, child_level) or ""
                    if not child_pcode or not child_pcode.startswith(parent_pcode):
                        continue

                    if not get_pcode(child_props, parent_level):
                        set_pcode(child_props, parent_level, parent_pcode)
                        filled += 1
                        print(
                            f"    set {get_pcode_key(parent_level)}={parent_pcode} "
                            f"on {get_pcode_key(child_level)}={child_pcode}"
                        )
                    if parent_name and not get_name(child_props, parent_level):
                        set_name(child_props, parent_level, parent_name)
                        filled += 1
                        print(
                            f"    set {get_name_key(parent_level)}={parent_name} "
                            f"on {get_pcode_key(child_level)}={child_pcode}"
                        )
    return filled


if __name__ == "__main__":
    clean_all_processed_admin_areas()
