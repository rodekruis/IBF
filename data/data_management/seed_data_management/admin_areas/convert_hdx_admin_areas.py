"""
Convert HDX COD-AB admin area files to the shared admin area format.
First fetch the HDX data using fetch_hdx_admin_areas.py, then run this.

HDX COD-AB datasets use varying property name conventions:
  - Newer datasets (e.g. ZMB): lowercase like adm3_name, adm3_pcode
  - Older datasets (e.g. LSO): uppercase like ADM2_EN, ADM2_PCODE
This script handles both conventions.
"""

import json
import os
from dataclasses import asdict
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    AdminAreaSource,
    COUNTRY_NAMES,
    get_countries_for_source,
)
from data_management.utils.admin_area_geojson import (
    AdminAreaFeatureCollection,
    AdminAreaProperties,
    Feature,
    Geometry,
)
from shared.country_data import CountryCodeIso2, CountryCodeIso3
from shared.data_helpers import get_seed_data_repo_path

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "sources" / "hdx"
OUTPUT_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"


def _get_property(props: dict[str, str | None], level: int, field: str) -> str | None:
    uppercase_key = f"ADM{level}_{field}"
    if uppercase_key in props:
        return props[uppercase_key]

    lowercase_map = {"EN": "name", "PCODE": "pcode", "REF": "ref_name"}
    lowercase_suffix = lowercase_map.get(field)
    if lowercase_suffix:
        lowercase_key = f"adm{level}_{lowercase_suffix}"
        return props.get(lowercase_key)

    return None


def convert_feature(
    hdx_properties: dict[str, str | None],
    geometry: dict,
    admin_level: int,
    iso_a2: str,
    iso_a3: str,
) -> Feature | None:
    errors: list[str] = []

    country_name = (
        _get_property(hdx_properties, 0, "EN")
        or hdx_properties.get("adm0_name")
        or COUNTRY_NAMES[iso_a3]
    )
    properties = AdminAreaProperties(
        POPULATION=None,
        ADM0_EN=country_name,
        ADM0_PCODE=iso_a2,
    )

    if admin_level >= 1:
        name = _get_property(hdx_properties, 1, "EN")
        pcode = _get_property(hdx_properties, 1, "PCODE")
        if not name:
            errors.append("Missing ADM1 name")
        if not pcode:
            errors.append("Missing ADM1 pcode")
        properties.ADM1_EN = name
        properties.ADM1_PCODE = pcode

    if admin_level >= 2:
        name = _get_property(hdx_properties, 2, "EN")
        pcode = _get_property(hdx_properties, 2, "PCODE")
        if not name:
            errors.append("Missing ADM2 name")
        if not pcode:
            errors.append("Missing ADM2 pcode")
        properties.ADM2_EN = name
        properties.ADM2_PCODE = pcode

    if admin_level >= 3:
        name = _get_property(hdx_properties, 3, "EN")
        pcode = _get_property(hdx_properties, 3, "PCODE")
        if not name:
            errors.append("Missing ADM3 name")
        if not pcode:
            errors.append("Missing ADM3 pcode")
        properties.ADM3_EN = name
        properties.ADM3_PCODE = pcode

    if admin_level >= 4:
        name = _get_property(hdx_properties, 4, "EN")
        pcode = _get_property(hdx_properties, 4, "PCODE")
        if not name:
            errors.append("Missing ADM4 name")
        if not pcode:
            errors.append("Missing ADM4 pcode")
        properties.ADM4_EN = name
        properties.ADM4_PCODE = pcode

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


def parse_admin_level(filename: str) -> int:
    stem = Path(filename).stem
    return int(stem.split("_adm")[1])


def parse_country_code(filename: str) -> str:
    return Path(filename).stem.split("_adm")[0]


def process_file(filepath: Path) -> AdminAreaFeatureCollection | None:
    filename = filepath.name
    admin_level = parse_admin_level(filename)
    country_iso_a3 = parse_country_code(filename)

    try:
        iso_a3 = CountryCodeIso3[country_iso_a3].value
        iso_a2 = CountryCodeIso2[country_iso_a3].value
    except KeyError:
        print(f"  ERROR: Unknown country code '{country_iso_a3}', skipping file")
        return None

    try:
        with open(filepath, encoding="utf-8") as f:
            hdx_data = json.load(f)
    except json.JSONDecodeError as error:
        print(f"  ERROR: Invalid GeoJSON in {filepath.name}: {error}")
        return None

    if hdx_data is None or "features" not in hdx_data:
        print(f"  ERROR: Invalid or empty GeoJSON in {filepath.name}, skipping")
        return None

    features: list[Feature] = []
    for hdx_feature in hdx_data["features"]:
        feature = convert_feature(
            hdx_properties=hdx_feature["properties"],
            geometry=hdx_feature["geometry"],
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
    output_path = OUTPUT_DIR / filepath.name
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(asdict(feature_collection), f, indent=2, ensure_ascii=False)
    print(f"  Saved to {output_path}")


def main() -> None:
    hdx_countries = get_countries_for_source(AdminAreaSource.HDX)
    input_files = []
    for country, levels in hdx_countries.items():
        for level in levels:
            filepath = INPUT_DIR / f"{country}_adm{level}.json"
            if filepath.exists():
                input_files.append(filepath)
            else:
                print(f"  WARNING: Expected file not found: {filepath}")

    print(f"Found {len(input_files)} HDX files to process")

    for filepath in sorted(input_files):
        print(f"Processing {filepath.name}...")
        result = process_file(filepath)
        if result is not None:
            save_output(result, filepath)


if __name__ == "__main__":
    main()
