"""
Clean all admin area GeoJSON files.

This script runs on files in the seed-data admin-areas/processed directory and saves over them.
It does the following:
 - normalizes polygons to multipolygons, and fixes related nesting
 - handles countries with multiple adm0 features (deletes disputed areas)
 - fills in any missing parent PCODE/name fields

Note: Using data from GADM, there are multiple admin level 0 shapes for China, India, and Pakistan.
The first shape is always the main country, while the others are disputed territories.
The current solution (June 2026) is to delete the shapes for disputed territories, which results in holes
in the map for the Kashmir region and part of the Himalayas (part of Arunachal Pradesh).
If we merge the disputed territories into the main country data, we get overlapping countries.
Depending on the draw order of the countries, our map would look like it agrees (at random) to one
territorial claim over another.
This may need to be handled differently in the future.
These are not the only disputed borders we may need to rework, but they are the only ones represented as individual
admin level 0 areas with the same country names.
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

    # Special processing for adm0 to check for extra adm0 areas
    if re.match(r"^.+_adm0\.json$", basename):
        features = remove_adm0_disputed_territories(features)
        geojson_data["features"] = features

    # Normalize geometries
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

    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, indent=2, ensure_ascii=False)

    print(
        f"Cleaned {basename} with {len(features)} features. Normalize count: {normalized_count}."
    )


def remove_adm0_disputed_territories(features: list[dict]) -> list[dict]:
    """Drop adm0 features sharing the same ADM0_PCODE, keeping only the first.
    The first adm0 area is always the recognized country.
    The additional adm0 areas are disputed territories.
    """
    kept_features: list[dict] = []
    seen_pcodes: set[str] = set()
    for feature in features:
        pcode = (feature.get("properties") or {}).get("ADM0_PCODE")
        if pcode:
            # If this is a PCODE we've already seen, skip it (remove from data)
            if pcode in seen_pcodes:
                print(f"  Dropping extra adm0 area. ADM0_PCODE={pcode}")
                continue
            seen_pcodes.add(pcode)
        kept_features.append(feature)

    return kept_features


def clean_all_processed_admin_areas() -> None:
    json_pattern = os.path.join(INPUT_DIR, FILE_PATTERN)
    json_files = sorted(glob.glob(json_pattern))

    print(f"Found {len(json_files)} GeoJSON files to clean.")

    for json_file in json_files:
        clean_admin_area_file(json_file)

    populate_all_missing_parents(json_files)


def populate_all_missing_parents(json_files: list[str]) -> None:

    # Make a dict of data for each country, with a list of each admin level
    country_levels: dict[str, list[int]] = defaultdict(list)
    for json_file in json_files:
        match = re.match(r"^(.+)_adm(\d+)\.json$", os.path.basename(json_file))
        if match:
            country_levels[match.group(1)].append(int(match.group(2)))

    # Process data for each country
    print(f"\nPopulating missing parents for {len(country_levels)} countries...")
    for country, levels in country_levels.items():
        # Sort the admin level order so we process parents first
        levels.sort()
        admin_data: dict[int, AdminAreaFeatureCollection] = {}
        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            with open(filepath, "r", encoding="utf-8") as f:
                admin_data[level] = dict_to_feature_collection(json.load(f))

        filled_count = populate_missing_parents(admin_data, levels)
        if not filled_count:
            # No data was changed
            continue

        # Write to disc
        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(
                    feature_collection_to_dict(admin_data[level]),
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        print(f"  {country}: filled {filled_count} missing parent field(s)")


def populate_missing_parents(
    admin_data: dict[int, AdminAreaFeatureCollection],
    admin_levels: list[int],
) -> int:
    """Fill in missing parent PCODE/name on child features via PCODE-prefix match.
    Existing values are preserved.
    """
    added_count = 0

    # Start at the highest admin level, and iterate down for all admin levels.
    # The place code for the parent is applied to all children.
    for parent_level in admin_levels:
        for parent_feature in admin_data[parent_level].features:

            # Get the place code
            parent_props = parent_feature.properties
            parent_pcode = get_pcode(parent_props, parent_level) or ""
            parent_name = get_name(parent_props, parent_level) or ""
            if not parent_pcode:
                print(f"Data error: missing place code for {get_pcode_key(parent_level)} on feature with properties {parent_props}.")
                continue

            # Iterate through admin levels and only process children
            for child_level in admin_levels:
                # skip levels that are not children
                if child_level <= parent_level:
                    continue

                # Add parent codes based on 'starts with' matching
                # Some countries won't have admin areas that match like this, but these countries would
                # already have their data filled out in the source data (since there is no way to infer parent codes).
                for child_feature in admin_data[child_level].features:
                    child_props = child_feature.properties
                    child_pcode = get_pcode(child_props, child_level) or ""
                    if not child_pcode or not child_pcode.startswith(parent_pcode):
                        continue

                    if not get_pcode(child_props, parent_level):
                        set_pcode(child_props, parent_level, parent_pcode)
                        added_count += 1
                        print(
                            f"    set {get_pcode_key(parent_level)}={parent_pcode} "
                            f"on {get_pcode_key(child_level)}={child_pcode}"
                        )
                    if parent_name and not get_name(child_props, parent_level):
                        set_name(child_props, parent_level, parent_name)
                        added_count += 1
                        print(
                            f"    set {get_name_key(parent_level)}={parent_name} "
                            f"on {get_pcode_key(child_level)}={child_pcode}"
                        )
    return added_count


if __name__ == "__main__":
    clean_all_processed_admin_areas()
