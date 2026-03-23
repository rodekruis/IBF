"""
This adds the missing admin parent codes on the admin data imported from IBF v1
This can't be calculated easily, since countries don't follow a standard.
For instance, here are 4 codes, all for admin 3:

"AO01002004"
"BF130002"
"CF1111"
"KM111"

These also have special handling:
    MDG - adm2 pcodes may be longer than adm3 codes (same code, but adm2 has a trailing "A")
    PHL - parent codes are prefixes of child codes, but with trailing zeroes (e.g. PH170000000)
    ZMB - adm3 codes don't start with the adm2 codes at all

The naming of these will follow the values from the UGA data (which already had this).
    "features": [
        {
        "type": "Feature",
        "properties": {
            "ADM4_EN": "Abako",
            "ADM4_PCODE": "UG30670101",
            "ADM3_EN": "Moroto",
            "ADM3_PCODE": "UG306701",
            "ADM2_EN": "Alebtong",
            "ADM2_PCODE": "UG3067",
            "ADM1_EN": "Northern",
            "ADM1_PCODE": "UG3",
            "ADM0_EN": "Uganda",
            "ADM0_PCODE": "UG",
        }

This script does the following:
- Look at all files in the dir, make a list of the country names, and print them.
- Foreach country, open all existing admin boundary files (1,2,3, and sometimes 4) in a list.
- Apply parent code and name children (all depths) that starts with the parent code.
  - If the parent code is invalid (empty, missing), print an error.
  - If a child already has a parent code, make sure it matches. If not, print an error.
- Repeat for parent levels (adm1, adm2, and adm3 (if adm4 exists))
- Save the files to the output directory.

Once all are done, go back and open all admin files for a country from the output directory.
- Check adm3 and adm4 files.
- Print if any data is missing. Print any errors
   - It should have the PCODE and name (_EN) for the current adm level, and all parents.
   - The higher admin levels (0,1,2) PCODE string shuld be a subset of the lower levels.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

from shared.data_helpers import get_seed_data_repo_path

BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas"
OUTPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas-output"


def discover_countries(input_dir: Path) -> dict[str, list[int]]:
    """Scan the directory for admin boundary files and return a dict of country -> sorted admin levels."""
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


def load_geojson(filepath: Path) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def save_geojson(filepath: Path, data: dict):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_pcode_key(admin_level: int) -> str:
    return f"ADM{admin_level}_PCODE"


def get_name_key(admin_level: int) -> str:
    return f"ADM{admin_level}_EN"


def populate_parent_codes(
    country: str,
    admin_data: dict[int, dict],
    admin_levels: list[int],
) -> list[str]:
    """
    For each parent level, find children (at all deeper levels) whose PCODE
    starts with the parent PCODE, and set the parent's PCODE and name on them.
    """
    errors: list[str] = []

    for parent_level in admin_levels:
        parent_geojson = admin_data[parent_level]
        parent_pcode_key = get_pcode_key(parent_level)
        parent_name_key = get_name_key(parent_level)

        for parent_feature in parent_geojson.get("features", []):
            parent_props = parent_feature.get("properties", {})
            parent_pcode = parent_props.get(parent_pcode_key, "")
            parent_name = parent_props.get(parent_name_key, "")

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
            for child_level in admin_levels:
                if child_level <= parent_level:
                    continue

                child_geojson = admin_data[child_level]
                child_pcode_key = get_pcode_key(child_level)

                for child_feature in child_geojson.get("features", []):
                    child_props = child_feature.get("properties", {})
                    child_pcode = child_props.get(child_pcode_key, "")

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

                    if not child_pcode.startswith(compare_parent_pcode):
                        continue

                    # If the child already has a parent code, verify it matches
                    existing_parent_pcode = child_props.get(parent_pcode_key, "")
                    if existing_parent_pcode and existing_parent_pcode != parent_pcode:
                        errors.append(
                            f"ERROR [{country}]: Child adm{child_level} PCODE={child_pcode} "
                            f"already has {parent_pcode_key}={existing_parent_pcode}, "
                            f"expected {parent_pcode}"
                        )
                        continue

                    child_props[parent_pcode_key] = parent_pcode
                    child_props[parent_name_key] = parent_name

    # ZMB: adm3 PCODEs don't start with adm2 PCODEs, so the normal pass won't
    # link parents to adm3. Instead, use the ADM2_PCODE already on each adm3
    # feature to look up the adm2 name and the adm1 parent via adm2's PCODE.
    if country == "ZMB" and 3 in admin_data:
        adm2_pcode_key = get_pcode_key(2)
        adm2_name_key = get_name_key(2)

        # Build a lookup from adm2 PCODE -> adm2 name
        adm2_lookup: dict[str, str] = {}
        if 2 in admin_data:
            for adm2_feature in admin_data[2].get("features", []):
                adm2_props = adm2_feature.get("properties", {})
                pcode = adm2_props.get(adm2_pcode_key, "")
                name = adm2_props.get(adm2_name_key, "")
                if pcode:
                    adm2_lookup[pcode] = name

        adm1_pcode_key = get_pcode_key(1)
        adm1_name_key = get_name_key(1)

        for child_feature in admin_data[3].get("features", []):
            child_props = child_feature.get("properties", {})
            child_adm2_pcode = child_props.get(adm2_pcode_key, "")

            if not child_adm2_pcode:
                continue

            # Copy adm2 name from the lookup
            if child_adm2_pcode in adm2_lookup:
                child_props[adm2_name_key] = adm2_lookup[child_adm2_pcode]

            # Find adm1 whose PCODE is a prefix of the adm2 PCODE
            if 1 in admin_data:
                for adm1_feature in admin_data[1].get("features", []):
                    adm1_props = adm1_feature.get("properties", {})
                    adm1_pcode = adm1_props.get(adm1_pcode_key, "")
                    adm1_name = adm1_props.get(adm1_name_key, "")

                    if adm1_pcode and child_adm2_pcode.startswith(adm1_pcode):
                        child_props[adm1_pcode_key] = adm1_pcode
                        child_props[adm1_name_key] = adm1_name
                        break

    return errors


def validate_country_data(
    country: str,
    admin_data: dict[int, dict],
    admin_levels: list[int],
) -> list[str]:
    """
    Validate adm3 and adm4 files: check that all features have PCODE and name
    for the current level and all parent levels, and that higher-level PCODEs
    are substrings (prefixes) of lower-level PCODEs.
    """
    errors: list[str] = []

    check_levels = [level for level in admin_levels if level >= 3]

    for level in check_levels:
        geojson = admin_data[level]
        pcode_key = get_pcode_key(level)
        name_key = get_name_key(level)

        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            feature_pcode = props.get(pcode_key, "")
            feature_name = props.get(name_key, "")

            if not feature_pcode:
                errors.append(f"VALIDATION [{country}] adm{level}: Missing {pcode_key}")
                continue

            if not feature_name:
                errors.append(
                    f"VALIDATION [{country}] adm{level}: {pcode_key}={feature_pcode} missing {name_key}"
                )

            # Check all parent levels (except adm0) have PCODE and name, and PCODE is a prefix
            for parent_level in range(1, level):
                parent_pcode_key = get_pcode_key(parent_level)
                parent_name_key = get_name_key(parent_level)
                parent_pcode = props.get(parent_pcode_key, "")
                parent_name = props.get(parent_name_key, "")

                if not parent_pcode:
                    errors.append(
                        f"VALIDATION [{country}] adm{level}: {pcode_key}={feature_pcode} "
                        f"missing parent {parent_pcode_key}"
                    )
                else:
                    # ZMB: adm3 PCODEs are numeric and don't share a prefix with any parent, skip
                    skip_prefix_check = country == "ZMB" and level == 3
                    # PHL uses trailing zeroes in parent codes (e.g. PH170000000)
                    # trying matching this this before printing error.
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
                            f"VALIDATION [{country}] adm{level}: {pcode_key}={feature_pcode} "
                            f"does not start with parent {parent_pcode_key}={parent_pcode}"
                        )

                if not parent_name:
                    errors.append(
                        f"VALIDATION [{country}] adm{level}: {pcode_key}={feature_pcode} "
                        f"missing parent {parent_name_key}"
                    )

    return errors


if __name__ == "__main__":
    # Step 1: Discover countries from filenames
    countries = discover_countries(INPUT_DIR)
    print(f"\nFound {len(countries)} countries:")
    for country, levels in countries.items():
        print(f"  {country}: admin levels {levels}")

    all_errors: list[str] = []

    # Step 2-5: For each country, load files, populate parent codes, and save
    for country, levels in countries.items():
        print(f"\nProcessing {country}...")

        admin_data: dict[int, dict] = {}
        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            admin_data[level] = load_geojson(filepath)

        errors = populate_parent_codes(country, admin_data, levels)
        all_errors.extend(errors)
        for error in errors:
            print(f"  {error}")

        for level in levels:
            output_path = OUTPUT_DIR / f"{country}_adm{level}.json"
            save_geojson(output_path, admin_data[level])
            print(f"  Saved {output_path.name}")

    # Step 6: Validation pass — re-read saved files and check adm3/adm4
    print("\n--- Validation Pass ---")
    for country, levels in countries.items():
        admin_data_check: dict[int, dict] = {}
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
