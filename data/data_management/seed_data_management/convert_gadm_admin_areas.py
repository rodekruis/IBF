"""
This script converts GADM admin files to the shared admin area format.
First fetch the GADM data using the admin boundary fetcher script,
then run this.

Set the target admin levels to specify which levels you want to convert.

Program steps:
1. Grab list of GADM admin area files with the target admin levels.
2. For each file:
    a) parse the data and reformat to match the expected format
    b) alert if any data is missing (depends on admin level).
       Admin0 codes and population are added later, so don't alert on these.
    c) Use the admin0 code to look up both ISO A2 and ISO A3 codes
     using the country code string enums.
    d) set population to None. Another script calculates this value
    e) if there were no errors, save the parse data to the output

"""

import glob
import json
import os
from dataclasses import asdict
from pathlib import Path

from data_management.utils.admin_area_geojson import (
    AdminAreaFeatureCollection,
    AdminAreaProperties,
    Feature,
    Geometry,
)
from shared.country_data import CountryCodeIso2, CountryCodeIso3
from shared.data_helpers import get_seed_data_repo_path

# Input/Output dirs
BASE_SEED_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "admin-areas-gadm"
OUTPUT_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"

# Set this to any level you want to convert (e.g. [0, 1, 2, 3])
TARGET_ADMIN_LEVELS = [0]


def get_input_files() -> list[Path]:
    """Get all GADM files matching the target admin levels."""
    files = []
    for level in TARGET_ADMIN_LEVELS:
        pattern = str(INPUT_DIR / f"*_adm{level}.json")
        files.extend(Path(f) for f in sorted(glob.glob(pattern)))
    return files


def parse_admin_level(filename: str) -> int:
    """Extract admin level from filename like 'ETH_adm1.json'."""
    stem = Path(filename).stem  # e.g. "ETH_adm1"
    return int(stem.split("_adm")[1])


def parse_country_code(filename: str) -> str:
    """Extract ISO A3 country code from filename like 'ETH_adm1.json'."""
    return Path(filename).stem.split("_adm")[0]


def convert_feature(
    gadm_properties: dict,
    geometry: dict,
    admin_level: int,
    iso_a2: str,
    iso_a3: str,
) -> Feature | None:
    """Convert a GADM feature to the expected admin area format.

    Returns None if required data is missing.
    """
    errors: list[str] = []

    properties = AdminAreaProperties(
        POPULATION=None,
        ADM0_EN=gadm_properties.get("COUNTRY"),
        ADM0_PCODE=iso_a2,
        ADM0_ISO_A2=iso_a2,
        ADM0_ISO_A3=iso_a3,
    )

    if admin_level >= 1:
        name = gadm_properties.get("NAME_1")
        pcode = gadm_properties.get("GID_1")
        if not name:
            errors.append("Missing NAME_1")
        if not pcode:
            errors.append("Missing GID_1")
        properties.ADM1_EN = name
        properties.ADM1_PCODE = pcode

    if admin_level >= 2:
        name = gadm_properties.get("NAME_2")
        pcode = gadm_properties.get("GID_2")
        if not name:
            errors.append("Missing NAME_2")
        if not pcode:
            errors.append("Missing GID_2")
        properties.ADM2_EN = name
        properties.ADM2_PCODE = pcode

    if admin_level >= 3:
        name = gadm_properties.get("NAME_3")
        pcode = gadm_properties.get("GID_3")
        if not name:
            errors.append("Missing NAME_3")
        if not pcode:
            errors.append("Missing GID_3")
        properties.ADM3_EN = name
        properties.ADM3_PCODE = pcode

    if errors:
        for error in errors:
            print(f"  WARNING: {error}")
        return None

    return Feature(
        type="Feature",
        geometry=Geometry(
            type=geometry["type"],
            coordinates=geometry["coordinates"],
        ),
        properties=properties,
    )


def process_file(filepath: Path) -> AdminAreaFeatureCollection | None:
    """Process a single GADM file and return the converted feature collection."""
    filename = filepath.name
    admin_level = parse_admin_level(filename)
    country_iso_a3 = parse_country_code(filename)

    # Look up ISO A2 code, and verify the ISO A3 code is valid
    try:
        iso_a3 = CountryCodeIso3[country_iso_a3].value
        iso_a2 = CountryCodeIso2[country_iso_a3].value
    except KeyError:
        print(f"  ERROR: Unknown country code '{country_iso_a3}', skipping file")
        return None

    with open(filepath, encoding="utf-8") as f:
        gadm_data = json.load(f)

    if gadm_data is None or "features" not in gadm_data:
        print(f"  ERROR: Invalid or empty GeoJSON in {filepath.name}, skipping")
        return None

    features: list[Feature] = []
    for gadm_feature in gadm_data["features"]:
        feature = convert_feature(
            gadm_properties=gadm_feature["properties"],
            geometry=gadm_feature["geometry"],
            admin_level=admin_level,
            iso_a2=iso_a2,
            iso_a3=iso_a3,
        )
        if feature is not None:
            features.append(feature)

    if not features:
        print(f"  WARNING: No valid features found in {filepath.name}")
        return None

    return AdminAreaFeatureCollection(type="FeatureCollection", features=features)


def save_output(
    feature_collection: AdminAreaFeatureCollection,
    filepath: Path,
) -> None:
    """Save the converted feature collection to the output directory."""
    output_path = OUTPUT_DIR / filepath.name
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        # Output with pretty printing
        json.dump(asdict(feature_collection), f, indent=2, ensure_ascii=False)
    print(f"  Saved to {output_path}")


def main() -> None:
    input_files = get_input_files()
    print(f"Found {len(input_files)} files to process")

    for filepath in input_files:
        print(f"Processing {filepath.name}...")
        result = process_file(filepath)
        if result is not None:
            save_output(result, filepath)


if __name__ == "__main__":
    main()
