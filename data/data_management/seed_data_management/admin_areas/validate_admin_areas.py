"""Validate configured admin-area data after population enrichment."""

import json
import math
import sys
from dataclasses import fields
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    ADMIN_AREA_LEVELS,
    ADMIN_AREA_SOURCES,
    AdminAreaSource,
)
from data_management.utils.admin_area_geojson import AdminAreaProperties
from shapely.geometry import shape
from shared.data_helpers import get_seed_data_repo_path

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
SOURCES_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "sources"
PROCESSED_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"
VALIDATION_REPORT_PATH = Path(__file__).with_name("admin_area_validation_report.md")
GITHUB_FILE_SIZE_LIMIT_BYTES = 100_000_000
POPULATION_TOTAL_DIFFERENCE_THRESHOLD = 0.01
CANONICAL_PROPERTY_NAMES = {field.name for field in fields(AdminAreaProperties)}


def load_feature_collection(filepath: Path) -> list[dict]:
    with open(filepath, encoding="utf-8") as file:
        data = json.load(file)

    if data.get("type") != "FeatureCollection":
        raise ValueError(f"Expected FeatureCollection in: {filepath}")

    features = data.get("features")
    if not isinstance(features, list):
        raise TypeError(f"Expected features list in: {filepath}")

    return features


def load_processed_file(country: str, level: int) -> list[dict] | None:
    filepath = PROCESSED_DIR / f"{country}_adm{level}.json"
    if not filepath.exists():
        return None
    return load_feature_collection(filepath)


def get_pcode_key(level: int) -> str:
    return f"ADM{level}_PCODE"


def get_parent_pcode_key(parent_level: int) -> str:
    return f"ADM{parent_level}_PCODE"


def count_populated_properties(features: list[dict], level: int) -> list[str]:
    property_names = get_required_property_names(level)
    property_names.append("POPULATION")

    return [
        f"{property_name}: {sum(feature.get('properties', {}).get(property_name) is not None for feature in features)}"
        for property_name in property_names
    ]


def get_required_property_names(level: int) -> list[str]:
    property_names = ["ADM0_PCODE"]
    if level == 0:
        property_names.append("ADM0_EN")
        return property_names

    property_names.extend(f"ADM{admin_level}_PCODE" for admin_level in range(1, level))
    property_names.extend([f"ADM{level}_PCODE", f"ADM{level}_EN"])
    return property_names


def get_population_total(features: list[dict]) -> int | float:
    return sum(
        population
        for feature in features
        if isinstance(
            (population := feature["properties"].get("POPULATION")), int | float
        )
        and not isinstance(population, bool)
        and math.isfinite(population)
    )


def validate_population_totals(
    country: str,
    level_data: dict[int, list[dict]],
) -> list[str]:
    if not level_data or 0 not in level_data:
        return []

    adm0_total = get_population_total(level_data[0])
    if adm0_total == 0:
        return []

    errors = []
    for level, features in level_data.items():
        population_total = get_population_total(features)
        difference = abs(population_total - adm0_total) / adm0_total
        if difference > POPULATION_TOTAL_DIFFERENCE_THRESHOLD:
            errors.append(
                f"{country} adm{level}: population total {population_total} differs "
                f"from adm0 total {adm0_total} by {difference:.2%}"
            )
    return errors


def validate_country(country: str, levels: list[int]) -> list[str]:
    errors: list[str] = []
    sorted_levels = sorted(levels)
    source = ADMIN_AREA_SOURCES[country]

    level_data: dict[int, list[dict]] = {}
    for level in sorted_levels:
        filename = f"{country}_adm{level}.json"
        source_path = SOURCES_DIR / source.value / filename
        processed_path = PROCESSED_DIR / filename

        if not source_path.exists() and source != AdminAreaSource.HDX:
            errors.append(f"{country} adm{level}: source file missing")
        elif source_path.exists():
            try:
                load_feature_collection(source_path)
            except (json.JSONDecodeError, TypeError, ValueError) as error:
                errors.append(f"{country} adm{level}: invalid source file: {error}")
        if not processed_path.exists():
            errors.append(f"{country} adm{level}: processed file missing")
            continue
        if processed_path.stat().st_size > GITHUB_FILE_SIZE_LIMIT_BYTES:
            errors.append(
                f"{country} adm{level}: processed file size {processed_path.stat().st_size:,} exceeds GitHub limit {GITHUB_FILE_SIZE_LIMIT_BYTES:,}"
            )

        try:
            level_data[level] = load_feature_collection(processed_path)
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            errors.append(f"{country} adm{level}: invalid processed file: {error}")

    for level in sorted_levels:
        if level not in level_data:
            continue

        features = level_data[level]
        pcode_key = get_pcode_key(level)
        properties = [feature.get("properties", {}) for feature in features]
        if any(
            not isinstance(feature_properties, dict)
            for feature_properties in properties
        ):
            errors.append(f"{country} adm{level}: feature with invalid properties")
            continue

        unknown_property_count = sum(
            bool(set(feature_properties) - CANONICAL_PROPERTY_NAMES)
            for feature_properties in properties
        )
        if unknown_property_count > 0:
            errors.append(
                f"{country} adm{level}: {unknown_property_count} features with unknown properties"
            )

        required_property_names = get_required_property_names(level)
        for property_name in required_property_names:
            missing_property_count = sum(
                feature_properties.get(property_name) is None
                for feature_properties in properties
            )
            if missing_property_count > 0:
                errors.append(
                    f"{country} adm{level}: {missing_property_count} features with missing {property_name}"
                )

        pcodes = [
            feature_properties.get(pcode_key) for feature_properties in properties
        ]
        pcodes_without_none = [p for p in pcodes if p is not None]

        if len(pcodes_without_none) != len(set(pcodes_without_none)):
            duplicates = [
                p for p in pcodes_without_none if pcodes_without_none.count(p) > 1
            ]
            errors.append(f"{country} adm{level}: duplicate pcodes: {set(duplicates)}")

        none_count = pcodes.count(None)
        if none_count > 0:
            errors.append(
                f"{country} adm{level}: {none_count} features with missing pcode"
            )

        missing_population_count = 0
        invalid_population_count = 0
        for feature_properties in properties:
            population = feature_properties.get("POPULATION")
            if population is None:
                missing_population_count += 1
            elif (
                isinstance(population, bool)
                or not isinstance(population, int | float)
                or not math.isfinite(population)
                or population < 0
            ):
                invalid_population_count += 1

        if missing_population_count > 0:
            errors.append(
                f"{country} adm{level}: {missing_population_count} features with missing population"
            )
        if invalid_population_count > 0:
            errors.append(
                f"{country} adm{level}: {invalid_population_count} features with invalid population"
            )

        invalid_geometry_count = 0
        non_multipolygon_count = 0
        for feature in features:
            geometry_data = feature.get("geometry")
            if not isinstance(geometry_data, dict):
                invalid_geometry_count += 1
                continue
            geometry = shape(geometry_data)
            if not geometry.is_valid:
                invalid_geometry_count += 1
            if geometry.geom_type != "MultiPolygon":
                non_multipolygon_count += 1

        if invalid_geometry_count > 0:
            errors.append(
                f"{country} adm{level}: {invalid_geometry_count} invalid or missing geometries"
            )
        if non_multipolygon_count > 0:
            errors.append(
                f"{country} adm{level}: {non_multipolygon_count} non-MultiPolygon geometries"
            )

    for level in sorted_levels:
        if level == 0 or level not in level_data:
            continue

        parent_level = level - 1
        if parent_level not in level_data:
            continue

        parent_pcodes = {
            f["properties"].get(get_pcode_key(parent_level))
            for f in level_data[parent_level]
        }

        parent_ref_key = get_parent_pcode_key(parent_level)
        for feature in level_data[level]:
            props = feature["properties"]
            child_pcode = props.get(get_pcode_key(level))
            parent_ref = props.get(parent_ref_key)

            if parent_ref is None:
                errors.append(
                    f"{country} adm{level} '{child_pcode}': missing parent ref at level {parent_level}"
                )
            elif parent_ref not in parent_pcodes:
                errors.append(
                    f"{country} adm{level} '{child_pcode}': parent '{parent_ref}' "
                    f"not found in adm{parent_level}"
                )

    errors.extend(validate_population_totals(country, level_data))

    return errors


def write_validation_report(report_lines: list[str]) -> None:
    temporary_path = VALIDATION_REPORT_PATH.with_suffix(".md.part")
    with open(temporary_path, "w", encoding="utf-8") as file:
        file.write("\n".join(report_lines))
        file.write("\n")
    temporary_path.replace(VALIDATION_REPORT_PATH)


def get_validation_summary() -> list[str]:
    return [
        "## Validation Result",
        "",
        "- Processed file availability and structure: passed",
        "- Stored source file availability and structure where applicable: passed",
        "- Processed property names are known: passed",
        "- Required pcode and current-level name presence: passed",
        "- Current-level pcode uniqueness: passed",
        "- Parent-reference integrity: passed",
        "- Geometry validity and MultiPolygon normalization: passed",
        f"- Processed file size below GitHub limit ({GITHUB_FILE_SIZE_LIMIT_BYTES:,} bytes): passed",
        "- Population presence and numeric validity: passed",
        f"- Population totals within {POPULATION_TOTAL_DIFFERENCE_THRESHOLD:.0%} of adm0: passed",
        "",
    ]


def main() -> None:
    all_errors: list[str] = []
    table_lines = [
        "| Country | Adm level | Source | Source areas | Processed areas | Population total | Populated processed fields |",
        "| --- | ---: | --- | ---: | ---: | ---: | --- |",
    ]
    for country, levels in ADMIN_AREA_LEVELS.items():
        print(f"Validating {country}...")
        country_errors = validate_country(country, levels)
        all_errors.extend(country_errors)
        source = ADMIN_AREA_SOURCES[country]
        for level in sorted(levels):
            filename = f"{country}_adm{level}.json"
            source_path = SOURCES_DIR / source.value / filename
            processed_path = PROCESSED_DIR / filename
            if not processed_path.exists():
                continue
            try:
                processed_features = load_feature_collection(processed_path)
            except (json.JSONDecodeError, TypeError, ValueError):
                continue
            source_count = (
                str(len(load_feature_collection(source_path)))
                if source_path.exists()
                else "not stored"
            )
            populated_properties = "<br>".join(
                count_populated_properties(processed_features, level)
            )
            population_total = get_population_total(processed_features)
            table_lines.append(
                f"| {country} | {level} | {source.value} | {source_count} | "
                f"{len(processed_features)} | {population_total:,} | {populated_properties} |"
            )

        for error in country_errors:
            print(f"  ERROR: {error}")

    print("\n".join(table_lines))
    print(f"\nValidation complete. {len(all_errors)} error(s) found.")
    if all_errors:
        print("Validation report not updated.")
        sys.exit(1)

    report_lines = [
        "# Admin Area Validation Report",
        "",
        "Generated by `validate_admin_areas.py` after a successful validation run.",
        "",
        *get_validation_summary(),
        *table_lines,
    ]
    write_validation_report(report_lines)
    print(f"Validation report updated: {VALIDATION_REPORT_PATH}")


if __name__ == "__main__":
    main()
