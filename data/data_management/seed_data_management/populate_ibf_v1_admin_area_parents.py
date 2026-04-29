"""
This adds the missing admin parent codes on the admin data imported from IBF v1.
The structure and issues with the IBF v1 data structure are different than other sources,
so this script is just for processing the IBF v1 data.

The admin codes can't be calculated easily, since countries don't follow a standard.
For instance, here are 4 codes, all for admin 3:

"AO01002004"
"BF130002"
"CF1111"
"KM111"

These also have special handling:
    MDG - adm2 pcodes may be longer than adm3 codes (same code, but adm2 has a trailing "A")
    PHL - parent codes are prefixes of child codes, but with trailing zeroes (e.g. PH170000000)
    ZMB - adm3 codes don't start with the adm2 codes at all

Note: Not all countries have ADM0 data, so I couldn't get the ADM0 name for all of them.

The structure follows the UGA data, but also adds some other fields.
See the data class definition in admin_area_geojson.py

This script does the following:
- Look at all files in the dir, make a list of the country names, and print them.
- For each country, open all existing admin area files (1,2,3, and sometimes 4) in a list.
- Apply parent code and name children (all depths) that starts with the parent code.
  - If the parent code is invalid (empty, missing), print an error.
  - If a child already has a parent code, make sure it matches. If not, print an error.
  - If a child level exists, but the parent adm code is never applied, print an error.
- Repeat for parent levels (adm1, adm2, and adm3 (if adm4 exists))
- Save the files to the output directory.

Once all are done, go back and open all admin files for a country from the output directory.
- Check adm2, 3 and 4 files.
- Check if any data is missing. Print any errors
   - It should have the PCODE and name (_EN) for the current adm level, and all parents.
   - The higher admin levels (0,1,2) PCODE string should be a subset of the lower levels.
- For each admin level, check for duplicates in that file of the PCODE for that level.
"""

import json
import re
from collections import defaultdict
from dataclasses import asdict, fields
from pathlib import Path

from data_management.utils.admin_area_geojson import (
    AdminAreaFeatureCollection,
    AdminAreaProperties,
    Feature,
    Geometry,
)
from shared.country_data import CountryCodeIso2
from shared.data_helpers import get_seed_data_repo_path

BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "admin-areas-v1"
OUTPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "processed"

# Known field names from AdminAreaProperties dataclass
ADMIN_AREA_PROPERTY_NAMES = {f.name for f in fields(AdminAreaProperties)}

# Track unknown fields we've already warned about (to avoid duplicate warnings)
_warned_unknown_fields: set[str] = set()


def discover_countries(input_dir: Path) -> dict[str, list[int]]:
    """Scan the input dir and return a dict of country -> sorted admin levels."""
    countries: dict[str, list[int]] = defaultdict(list)
    for json_file in sorted(input_dir.glob("*.json")):
        match = re.match(r"^(.+)_adm(\d+)\.json$", json_file.name)
        if match:
            country = match.group(1)
            admin_level = int(match.group(2))
            countries[country].append(admin_level)

    for country in countries:
        countries[country].sort()

    return dict(countries)


def dict_to_feature_collection(data: dict) -> AdminAreaFeatureCollection:
    """Convert a dict (from JSON) to AdminAreaFeatureCollection."""
    features = []
    for feat_dict in data.get("features", []):
        props_dict = feat_dict.get("properties", {})
        # Filter to only known fields, print warning for unknown fields
        filtered_props = {}
        for key, value in props_dict.items():
            if key in ADMIN_AREA_PROPERTY_NAMES:
                filtered_props[key] = value
            elif key not in _warned_unknown_fields:
                print(f"  -- Unknown property '{key}' will be ignored")
                _warned_unknown_fields.add(key)
        props = AdminAreaProperties(**filtered_props)
        geom_dict = feat_dict.get("geometry", {})
        geometry = Geometry(
            type=geom_dict.get("type", ""),
            coordinates=geom_dict.get("coordinates", []),
        )
        features.append(
            Feature(
                type=feat_dict.get("type", "Feature"),
                geometry=geometry,
                properties=props,
            )
        )
    return AdminAreaFeatureCollection(
        type=data.get("type", "FeatureCollection"), features=features
    )


def feature_collection_to_dict(fc: AdminAreaFeatureCollection) -> dict:
    """Convert AdminAreaFeatureCollection to a dict for JSON export."""
    return {
        "type": fc.type,
        "features": [
            {
                "type": f.type,
                "geometry": asdict(f.geometry),
                "properties": {
                    k: v for k, v in asdict(f.properties).items() if v is not None
                },
            }
            for f in fc.features
        ],
    }


def load_geojson(filepath: Path) -> AdminAreaFeatureCollection:
    with open(filepath, "r", encoding="utf-8") as f:
        return dict_to_feature_collection(json.load(f))


def save_geojson(filepath: Path, data: AdminAreaFeatureCollection) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(feature_collection_to_dict(data), f, indent=2, ensure_ascii=False)


def get_pcode_key(admin_level: int) -> str:
    return f"ADM{admin_level}_PCODE"


def get_name_key(admin_level: int) -> str:
    return f"ADM{admin_level}_EN"


def get_pcode(props: AdminAreaProperties, admin_level: int) -> str | None:
    """Get the PCODE for a given admin level from properties."""
    return getattr(props, get_pcode_key(admin_level), None)


def set_pcode(props: AdminAreaProperties, admin_level: int, value: str) -> None:
    """Set the PCODE for a given admin level on properties."""
    setattr(props, get_pcode_key(admin_level), value)


def get_name(props: AdminAreaProperties, admin_level: int) -> str | None:
    """Get the name for a given admin level from properties."""
    return getattr(props, get_name_key(admin_level), None)


def set_name(props: AdminAreaProperties, admin_level: int, value: str) -> None:
    """Set the name for a given admin level on properties."""
    setattr(props, get_name_key(admin_level), value)


def add_default_values(props: AdminAreaProperties, iso2: str) -> None:
    """Add ADM0 fields and POPULATION to a feature's properties."""
    props.ADM0_PCODE = iso2
    props.ADM0_ISO_A2 = iso2
    props.ADM0_ISO_A3 = CountryCodeIso2(iso2).name
    props.POPULATION = None


def set_adm0_fields_on_adm1(
    admin_data: dict[int, AdminAreaFeatureCollection],
) -> None:
    """
    Set ADM0_PCODE, ADM0_ISO_A2, ADM0_ISO_A3, and POPULATION on adm1 features.
    These values are derived from the first 2 characters of the ADM1_PCODE.
    """
    if 1 not in admin_data:
        return

    for feature in admin_data[1].features:
        props = feature.properties
        adm1_pcode = props.ADM1_PCODE or ""
        if adm1_pcode and len(adm1_pcode) >= 2:
            add_default_values(props, adm1_pcode[:2])


def populate_parent_codes(
    country: str,
    admin_data: dict[int, AdminAreaFeatureCollection],
    admin_levels: list[int],
) -> list[str]:
    """
    For each parent level, find children (at all deeper levels) whose PCODE
    starts with the parent PCODE, and set the parent's PCODE and name on them.
    """
    errors: list[str] = []

    for parent_level in admin_levels:
        parent_geojson = admin_data[parent_level]

        for parent_feature in parent_geojson.features:
            parent_props = parent_feature.properties
            parent_pcode = get_pcode(parent_props, parent_level) or ""
            parent_name = get_name(parent_props, parent_level) or ""

            if not parent_pcode:
                errors.append(
                    f"ERROR [{country}]: Parent at adm{parent_level} has empty/missing PCODE"
                )
                continue

            if not parent_name:
                errors.append(
                    f"ERROR [{country}]: Parent at adm{parent_level} PCODE={parent_pcode} has empty/missing name"
                )

            # Apply this parent's info to all deeper admin levels
            was_parent_code_applied = False
            for child_level in admin_levels:

                # Skip levels that are not children of the current level.
                if child_level <= parent_level:
                    # set true to skip this alert (since no lower admin level exists)
                    was_parent_code_applied = True
                    continue

                child_geojson = admin_data[child_level]

                for child_feature in child_geojson.features:
                    child_props = child_feature.properties
                    child_pcode = get_pcode(child_props, child_level) or ""

                    if not child_pcode:
                        continue

                    # MDG: adm2 PCODEs have a trailing "A" that adm3 PCODEs lack
                    compare_parent_pcode = parent_pcode
                    if (
                        country == "MDG"
                        and parent_level == 2
                        and parent_pcode.endswith("A")
                    ):
                        compare_parent_pcode = parent_pcode[:-1]

                    # Skip if not a match (using startswith comparison)
                    if not child_pcode.startswith(compare_parent_pcode):
                        continue

                    # If the child already has a parent code,
                    # check if it matches the one we're trying to set now.
                    existing_parent_pcode = get_pcode(child_props, parent_level) or ""
                    if existing_parent_pcode and existing_parent_pcode != parent_pcode:
                        errors.append(
                            f"ERROR [{country}]: Child adm{child_level} PCODE={child_pcode} "
                            f"already has {get_pcode_key(parent_level)}={existing_parent_pcode}, "
                            f"expected {parent_pcode}"
                        )
                        continue

                    # At this point in the function, we have a matching code, so apply it.
                    set_pcode(child_props, parent_level, parent_pcode)
                    set_name(child_props, parent_level, parent_name)
                    was_parent_code_applied = True

                    # When setting the adm1 PCODE, also set the adm0 code (first 2 chars of adm1 PCODE)
                    # there are no adm0 JSON files, so we need to derive the adm0 code ourselves.
                    # Also set the other default values
                    if parent_level == 1 and len(parent_pcode) >= 2:
                        add_default_values(child_props, parent_pcode[:2])

            if not was_parent_code_applied:
                errors.append(
                    f"ERROR [{country}]: Parent adm{parent_level} PCODE={parent_pcode} "
                    f"was never applied to any child"
                )

    # ZMB: adm3 PCODEs don't start with adm2 PCODEs, so the normal pass won't
    # link parents to adm3. Instead, use the ADM2_PCODE already on each adm3
    # feature to look up the adm2 name and the adm1 parent via adm2's PCODE.
    if country == "ZMB" and 3 in admin_data:
        # Build a lookup from adm2 PCODE -> adm2 name
        adm2_lookup: dict[str, str] = {}
        if 2 in admin_data:
            for adm2_feature in admin_data[2].features:
                adm2_props = adm2_feature.properties
                pcode = adm2_props.ADM2_PCODE or ""
                name = adm2_props.ADM2_EN or ""
                if pcode:
                    adm2_lookup[pcode] = name

        for child_feature in admin_data[3].features:
            child_props = child_feature.properties
            child_adm2_pcode = child_props.ADM2_PCODE or ""

            if not child_adm2_pcode:
                continue

            # Copy adm2 name from the lookup
            if child_adm2_pcode in adm2_lookup:
                child_props.ADM2_EN = adm2_lookup[child_adm2_pcode]

            # Find adm1 whose PCODE is a prefix of the adm2 PCODE
            if 1 in admin_data:
                for adm1_feature in admin_data[1].features:
                    adm1_props = adm1_feature.properties
                    adm1_pcode = adm1_props.ADM1_PCODE or ""
                    adm1_name = adm1_props.ADM1_EN or ""

                    if adm1_pcode and child_adm2_pcode.startswith(adm1_pcode):
                        child_props.ADM1_PCODE = adm1_pcode
                        child_props.ADM1_EN = adm1_name
                        if len(adm1_pcode) >= 2:
                            add_default_values(child_props, adm1_pcode[:2])
                        break

    return errors


def validate_country_data(
    country: str,
    admin_data: dict[int, AdminAreaFeatureCollection],
    admin_levels: list[int],
) -> list[str]:
    """
    Validate adm2, adm3, and adm4 files: check that all features have PCODE and name
    for the current level and all parent levels, and that higher-level PCODEs
    are substrings (prefixes) of lower-level PCODEs.
    """
    errors: list[str] = []

    check_levels = [level for level in admin_levels if level >= 2]

    for level in check_levels:
        geojson = admin_data[level]

        for feature in geojson.features:
            props = feature.properties
            feature_pcode = get_pcode(props, level) or ""
            feature_name = get_name(props, level) or ""

            if not feature_pcode:
                errors.append(
                    f"VALIDATION [{country}] adm{level}: Missing {get_pcode_key(level)}"
                )
                continue

            if not feature_name:
                errors.append(
                    f"VALIDATION [{country}] adm{level}: {get_pcode_key(level)}={feature_pcode} missing {get_name_key(level)}"
                )

            # Check all parent levels (except adm0) have PCODE and name, and PCODE is a prefix
            for parent_level in range(1, level):
                parent_pcode = get_pcode(props, parent_level) or ""
                parent_name = get_name(props, parent_level) or ""

                if not parent_pcode:
                    errors.append(
                        f"VALIDATION [{country}] adm{level}: {get_pcode_key(level)}={feature_pcode} "
                        f"missing parent {get_pcode_key(parent_level)}"
                    )
                else:
                    # ZMB: adm3 PCODEs are numeric and don't share a prefix with any parent, skip
                    skip_prefix_check = country == "ZMB" and level == 3
                    # PHL uses trailing zeroes in parent codes (e.g. PH170000000)
                    # Try matching for the PHL case before printing an error.
                    compare_pcode = (
                        parent_pcode.rstrip("0") if country == "PHL" else parent_pcode
                    )
                    # MDG: adm2 PCODEs have a trailing "A" that adm3 PCODEs lack
                    if (
                        country == "MDG"
                        and parent_level == 2
                        and compare_pcode.endswith("A")
                    ):
                        compare_pcode = compare_pcode[:-1]
                    if not skip_prefix_check and not feature_pcode.startswith(
                        compare_pcode
                    ):
                        errors.append(
                            f"VALIDATION [{country}] adm{level}: {get_pcode_key(level)}={feature_pcode} "
                            f"does not start with parent {get_pcode_key(parent_level)}={parent_pcode}"
                        )

                if not parent_name:
                    errors.append(
                        f"VALIDATION [{country}] adm{level}: {get_pcode_key(level)}={feature_pcode} "
                        f"missing parent {get_name_key(parent_level)}"
                    )

        # Check for duplicate PCODEs at the current admin level
        seen_pcodes: dict[str, int] = {}
        for feature in geojson.features:
            props = feature.properties
            feature_pcode = get_pcode(props, level) or ""
            if not feature_pcode:
                continue
            seen_pcodes[feature_pcode] = seen_pcodes.get(feature_pcode, 0) + 1
        for pcode, count in seen_pcodes.items():
            if count > 1:
                errors.append(
                    f"VALIDATION [{country}] adm{level}: Duplicate {get_pcode_key(level)}={pcode} "
                    f"appears {count} times"
                )

    return errors


if __name__ == "__main__":
    # Create list of countries from filenames
    countries = discover_countries(INPUT_DIR)
    print(f"\nFound {len(countries)} countries:")
    for country, levels in countries.items():
        print(f"  {country}: admin levels {levels}")

    all_errors: list[str] = []

    # For each country, load files, populate parent codes, and save
    for country, levels in countries.items():
        print(f"\nProcessing {country}...")

        admin_data: dict[int, AdminAreaFeatureCollection] = {}
        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            admin_data[level] = load_geojson(filepath)

        set_adm0_fields_on_adm1(admin_data)
        errors = populate_parent_codes(country, admin_data, levels)
        all_errors.extend(errors)
        for error in errors:
            print(f"  {error}")

        for level in levels:
            output_path = OUTPUT_DIR / f"{country}_adm{level}.json"
            save_geojson(output_path, admin_data[level])
            print(f"  Saved {output_path.name}")

    # Validation pass — re-read saved files and check for errors
    print("\n--- Validation Pass ---")
    for country, levels in countries.items():
        admin_data_check: dict[int, AdminAreaFeatureCollection] = {}
        for level in levels:
            filepath = OUTPUT_DIR / f"{country}_adm{level}.json"
            admin_data_check[level] = load_geojson(filepath)

        validation_errors = validate_country_data(country, admin_data_check, levels)
        all_errors.extend(validation_errors)
        for error in validation_errors:
            print(f"  {error}")

    if not all_errors:
        print("\nAll data validated successfully. No errors found.")
    else:
        print(f"\nTotal errors: {len(all_errors)}")
