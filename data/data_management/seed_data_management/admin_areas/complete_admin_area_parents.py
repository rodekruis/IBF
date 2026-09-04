"""Create explicitly configured parent areas omitted by an upstream source."""

import json
from dataclasses import fields
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    SYNTHETIC_PARENT_PCODES,
)
from data_management.utils.admin_area_geojson import AdminAreaProperties
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shared.data_helpers import get_seed_data_repo_path

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
PROCESSED_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"


def get_pcode_key(level: int) -> str:
    return f"ADM{level}_PCODE"


def load_file(country: str, level: int) -> dict:
    filepath = PROCESSED_DIR / f"{country}_adm{level}.json"
    with open(filepath, encoding="utf-8") as file:
        return json.load(file)


def save_file(country: str, level: int, feature_collection: dict) -> None:
    filepath = PROCESSED_DIR / f"{country}_adm{level}.json"
    with open(filepath, "w", encoding="utf-8") as file:
        json.dump(feature_collection, file, indent=2, ensure_ascii=False)


def create_parent_feature(child_features: list[dict], parent_level: int) -> dict:
    parent_pcode_key = get_pcode_key(parent_level)
    parent_pcodes = {
        feature["properties"].get(parent_pcode_key) for feature in child_features
    }
    if len(parent_pcodes) != 1 or None in parent_pcodes:
        raise ValueError(
            f"Cannot derive a single {parent_pcode_key} from child features"
        )

    parent_names = {
        feature["properties"].get(f"ADM{parent_level}_EN") for feature in child_features
    }
    if len(parent_names) != 1 or None in parent_names:
        raise ValueError(
            f"Cannot derive a single ADM{parent_level}_EN from child features"
        )

    canonical_property_names = {field.name for field in fields(AdminAreaProperties)}
    properties = {
        key: value
        for key, value in child_features[0]["properties"].items()
        if key in canonical_property_names
    }
    for level in range(parent_level + 1, 5):
        properties[f"ADM{level}_EN"] = None
        properties[f"ADM{level}_PCODE"] = None

    geometry = unary_union([shape(feature["geometry"]) for feature in child_features])
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": dict(mapping(geometry)),
    }


def complete_country(country: str, configured_levels: dict[int, set[str]]) -> None:
    for parent_level, parent_pcodes in configured_levels.items():
        parent_collection = load_file(country, parent_level)
        child_collection = load_file(country, parent_level + 1)
        parent_pcode_key = get_pcode_key(parent_level)
        existing_pcodes = {
            feature["properties"].get(parent_pcode_key)
            for feature in parent_collection["features"]
        }

        for parent_pcode in parent_pcodes:
            if parent_pcode in existing_pcodes:
                continue

            child_features = [
                feature
                for feature in child_collection["features"]
                if feature["properties"].get(parent_pcode_key) == parent_pcode
            ]
            if not child_features:
                raise ValueError(
                    f"{country} adm{parent_level}: no children found for configured parent '{parent_pcode}'"
                )

            parent_collection["features"].append(
                create_parent_feature(child_features, parent_level)
            )
            print(
                f"  {country} adm{parent_level}: created '{parent_pcode}' from "
                f"{len(child_features)} child geometries"
            )

        save_file(country, parent_level, parent_collection)


def main() -> None:
    for country, configured_levels in SYNTHETIC_PARENT_PCODES.items():
        complete_country(country, configured_levels)


if __name__ == "__main__":
    main()
