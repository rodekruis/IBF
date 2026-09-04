"""Repair and normalize converted admin area geometries before validation."""

import json
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    ADMIN_AREA_LEVELS,
    GEOMETRY_SIMPLIFICATION_TOLERANCE,
    PROCESSED_FILE_SIMPLIFICATION_THRESHOLD_BYTES,
)
from shapely.geometry import mapping, MultiPolygon, Polygon, shape
from shapely.ops import unary_union
from shapely.validation import make_valid
from shared.data_helpers import get_seed_data_repo_path

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
PROCESSED_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"


def to_multipolygon(
    geometry: dict, simplification_tolerance: float | None = None
) -> dict:
    parsed_geometry = shape(geometry)
    repaired_geometry = make_valid(parsed_geometry)

    if simplification_tolerance is not None:
        repaired_geometry = make_valid(
            repaired_geometry.simplify(
                simplification_tolerance,
                preserve_topology=True,
            )
        )

    if isinstance(repaired_geometry, Polygon):
        repaired_geometry = MultiPolygon([repaired_geometry])

    if not isinstance(repaired_geometry, MultiPolygon):
        raise TypeError(
            f"Expected polygonal geometry, got {repaired_geometry.geom_type}"
        )

    return dict(mapping(repaired_geometry))


def merge_duplicate_place_codes(
    features: list[dict], level: int, simplification_tolerance: float | None
) -> tuple[list[dict], int]:
    pcode_key = f"ADM{level}_PCODE"
    features_by_pcode: dict[str, list[dict]] = {}
    features_without_pcode: list[dict] = []

    for feature in features:
        pcode = feature["properties"].get(pcode_key)
        if not isinstance(pcode, str):
            features_without_pcode.append(feature)
            continue
        features_by_pcode.setdefault(pcode, []).append(feature)

    merged_features = features_without_pcode.copy()
    merged_count = 0
    for pcode, matching_features in features_by_pcode.items():
        representative = matching_features[0]
        if any(
            feature["properties"] != representative["properties"]
            for feature in matching_features[1:]
        ):
            raise ValueError(
                f"Conflicting duplicate {pcode_key} '{pcode}' cannot be merged"
            )

        if len(matching_features) > 1:
            geometries = [shape(feature["geometry"]) for feature in matching_features]
            representative["geometry"] = to_multipolygon(
                dict(mapping(unary_union(geometries))),
                simplification_tolerance,
            )
            merged_count += len(matching_features) - 1

        merged_features.append(representative)

    return merged_features, merged_count


def prepare_file(country: str, level: int) -> None:
    filepath = PROCESSED_DIR / f"{country}_adm{level}.json"
    if not filepath.exists():
        print(f"  WARNING: Processed file missing: {filepath}")
        return

    with open(filepath, encoding="utf-8") as file:
        feature_collection = json.load(file)

    simplification_tolerance = (
        GEOMETRY_SIMPLIFICATION_TOLERANCE
        if filepath.stat().st_size > PROCESSED_FILE_SIMPLIFICATION_THRESHOLD_BYTES
        else None
    )
    repaired_count = 0
    for feature in feature_collection["features"]:
        original_geometry = feature.get("geometry")
        if not isinstance(original_geometry, dict):
            raise TypeError(f"{filepath}: feature without geometry")

        prepared_geometry = to_multipolygon(original_geometry, simplification_tolerance)
        if prepared_geometry != original_geometry:
            feature["geometry"] = prepared_geometry
            repaired_count += 1

    merged_features, merged_count = merge_duplicate_place_codes(
        feature_collection["features"],
        level,
        simplification_tolerance,
    )
    feature_collection["features"] = merged_features

    with open(filepath, "w", encoding="utf-8") as file:
        json.dump(feature_collection, file, indent=2, ensure_ascii=False)

    print(
        f"  {country} adm{level}: prepared {len(feature_collection['features'])} features; "
        f"changed {repaired_count}; merged {merged_count}"
    )


def main() -> None:
    for country, levels in ADMIN_AREA_LEVELS.items():
        for level in sorted(levels):
            prepare_file(country, level)


if __name__ == "__main__":
    main()
