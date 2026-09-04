"""Generate admin-area source and processing metadata for the seed-data repo."""

import json
from datetime import datetime, UTC
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    ADMIN_AREA_LEVELS,
    ADMIN_AREA_SOURCES,
    AdminAreaSource,
    GADM_VERSION,
    GEOMETRY_SIMPLIFICATION_TOLERANCE,
    HDX_DATASET_IDS,
    PROCESSED_FILE_SIMPLIFICATION_THRESHOLD_BYTES,
    SYNTHETIC_PARENT_PCODES,
)
from shared.data_helpers import get_seed_data_repo_path

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
OUTPUT_PATH = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "admin_area_sources.json"


def get_country_manifest(country: str) -> dict:
    source = ADMIN_AREA_SOURCES[country]
    source_metadata: dict[str, str | list[int] | bool] = {
        "source": source.value,
        "levels": ADMIN_AREA_LEVELS[country],
    }

    if source == AdminAreaSource.HDX:
        dataset_id = HDX_DATASET_IDS[country]
        source_metadata.update(
            {
                "datasetId": dataset_id,
                "datasetUrl": f"https://data.humdata.org/dataset/{dataset_id}",
                "rawSourceFilesCommitted": False,
            }
        )
    elif source == AdminAreaSource.GADM:
        source_metadata.update(
            {
                "sourceVersion": GADM_VERSION,
                "datasetUrl": "https://gadm.org/data.html",
                "rawSourceFilesCommitted": True,
            }
        )

    synthetic_parents = SYNTHETIC_PARENT_PCODES.get(country)
    if synthetic_parents:
        source_metadata["syntheticParentPcodes"] = {
            f"adm{level}": sorted(pcodes) for level, pcodes in synthetic_parents.items()
        }

    if country == "KEN":
        source_metadata["notes"] = [
            "HDX does not provide a compatible adm3 layer; Kenya uses GADM for all configured levels."
        ]

    return source_metadata


def build_manifest() -> dict:
    return {
        "generatedAt": datetime.now(UTC).date().isoformat(),
        "generatedBy": "IBF/data/data_management/seed_data_management/admin_areas",
        "processedDirectory": "admin-areas/processed",
        "processing": {
            "rawHdxSources": "local-cache-only",
            "geometrySimplification": {
                "method": "shapely.simplify(preserve_topology=True)",
                "processedFileThresholdBytes": PROCESSED_FILE_SIMPLIFICATION_THRESHOLD_BYTES,
                "tolerance": GEOMETRY_SIMPLIFICATION_TOLERANCE,
            },
            "geometryValidation": "valid MultiPolygon geometries required",
            "population": "WorldPop-derived raster zonal statistics, calculated independently per admin level",
        },
        "countries": {
            country: get_country_manifest(country) for country in ADMIN_AREA_LEVELS
        },
    }


def main() -> None:
    manifest = build_manifest()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2, ensure_ascii=False)
        file.write("\n")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
