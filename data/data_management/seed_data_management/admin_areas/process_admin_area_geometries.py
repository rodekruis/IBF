"""Repair and normalize converted admin area geometries before validation."""

import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    ADMIN_AREA_LEVELS,
    MAPSHAPER_SIMPLIFICATION_P90_THRESHOLDS_BYTES,
    MAPSHAPER_SIMPLIFICATION_PERCENTAGES,
)
from shapely.geometry import mapping, MultiPolygon, Polygon, shape
from shapely.ops import unary_union
from shapely.validation import make_valid
from shared.data_helpers import get_seed_data_repo_path

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
PROCESSED_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"
DATA_DIR = Path(__file__).parents[3]


def get_mapshaper_executable() -> str:
    local_executable = DATA_DIR / "node_modules" / ".bin" / "mapshaper"
    if local_executable.exists():
        return str(local_executable)

    executable = shutil.which("mapshaper")
    if executable is None:
        raise RuntimeError(
            "Mapshaper is required for files selected for topology-aware simplification"
        )
    return executable


def simplify_with_mapshaper(filepath: Path, simplification_percentage: str) -> dict:
    executable = get_mapshaper_executable()
    with tempfile.TemporaryDirectory() as temporary_directory:
        output_path = Path(temporary_directory) / filepath.name
        subprocess.run(
            [
                executable,
                str(filepath),
                "-simplify",
                simplification_percentage,
                "keep-shapes",
                "-o",
                "format=geojson",
                str(output_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        with open(output_path, encoding="utf-8") as file:
            return json.load(file)


def to_multipolygon(geometry: dict) -> dict:
    parsed_geometry = shape(geometry)
    repaired_geometry = make_valid(parsed_geometry)

    if isinstance(repaired_geometry, Polygon):
        repaired_geometry = MultiPolygon([repaired_geometry])

    if not isinstance(repaired_geometry, MultiPolygon):
        raise TypeError(
            f"Expected polygonal geometry, got {repaired_geometry.geom_type}"
        )

    return dict(mapping(repaired_geometry))


def merge_duplicate_place_codes(
    features: list[dict], level: int
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
                dict(mapping(unary_union(geometries)))
            )
            merged_count += len(matching_features) - 1

        merged_features.append(representative)

    return merged_features, merged_count


def get_feature_size(feature: dict) -> int:
    return len(json.dumps(feature, separators=(",", ":"), ensure_ascii=False).encode())


def get_simplification_percentage(level: int, features: list[dict]) -> str | None:
    p90_threshold = MAPSHAPER_SIMPLIFICATION_P90_THRESHOLDS_BYTES.get(level)
    if p90_threshold is None or not features:
        return None

    feature_sizes = sorted(get_feature_size(feature) for feature in features)
    percentile_index = math.ceil(0.9 * len(feature_sizes)) - 1
    p90_size = feature_sizes[percentile_index]
    if p90_size <= p90_threshold:
        return None

    return MAPSHAPER_SIMPLIFICATION_PERCENTAGES[level]


def prepare_file(country: str, level: int) -> None:
    filepath = PROCESSED_DIR / f"{country}_adm{level}.json"
    if not filepath.exists():
        print(f"  WARNING: Processed file missing: {filepath}")
        return

    with open(filepath, encoding="utf-8") as file:
        original_feature_collection = json.load(file)

    simplification_percentage = get_simplification_percentage(
        level,
        original_feature_collection["features"],
    )
    if simplification_percentage is not None:
        feature_collection = simplify_with_mapshaper(
            filepath, simplification_percentage
        )
    else:
        feature_collection = original_feature_collection

    repaired_count = 0
    for feature in feature_collection["features"]:
        original_geometry = feature.get("geometry")
        if not isinstance(original_geometry, dict):
            raise TypeError(f"{filepath}: feature without geometry")

        prepared_geometry = to_multipolygon(original_geometry)
        if prepared_geometry != original_geometry:
            feature["geometry"] = prepared_geometry
            repaired_count += 1

    merged_features, merged_count = merge_duplicate_place_codes(
        feature_collection["features"],
        level,
    )
    feature_collection["features"] = merged_features

    with open(filepath, "w", encoding="utf-8") as file:
        json.dump(feature_collection, file, indent=2, ensure_ascii=False)

    print(
        f"  {country} adm{level}: prepared {len(feature_collection['features'])} features; "
        f"changed {repaired_count}; merged {merged_count}; "
        f"mapshaper={simplification_percentage or 'no'}"
    )


def main() -> None:
    for country, levels in ADMIN_AREA_LEVELS.items():
        for level in sorted(levels):
            prepare_file(country, level)


if __name__ == "__main__":
    main()
