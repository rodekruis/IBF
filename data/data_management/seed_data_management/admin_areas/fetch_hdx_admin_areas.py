"""
Fetch admin area boundaries from HDX (OCHA COD-AB) for countries/levels
configured to use the HDX source.

Downloads GeoJSON or SHP zip archives and extracts per-level files into
the sources/hdx/ directory in the seed-data repo.
"""

import io
import json
import shutil
import zipfile
from pathlib import Path

import fiona
import requests
from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    AdminAreaSource,
    get_countries_for_source,
    HDX_DATASET_IDS,
)
from shared.data_helpers import get_seed_data_repo_path

HDX_API_BASE = "https://data.humdata.org/api/3/action/package_show"

BASE_REPO_DIR = get_seed_data_repo_path()
DATA_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "sources" / "hdx"


def get_download_url(dataset_id: str) -> tuple[str, str]:
    response = requests.get(f"{HDX_API_BASE}?id={dataset_id}", timeout=30)
    response.raise_for_status()
    data = response.json()

    if not data.get("success"):
        raise RuntimeError(f"HDX API returned failure for dataset '{dataset_id}'")

    shp_url: str | None = None
    for resource in data["result"]["resources"]:
        fmt = resource["format"].upper()
        if fmt == "GEOJSON":
            return resource["url"], "geojson"
        if fmt == "SHP":
            shp_url = resource["url"]

    if shp_url:
        return shp_url, "shp"

    raise RuntimeError(f"No GeoJSON or SHP resource found for dataset '{dataset_id}'")


def extract_geojson_levels(
    zip_bytes: bytes,
    country: str,
    needed_levels: list[int],
) -> None:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for level in needed_levels:
            level_patterns = (f"adm{level}", f"admin{level}")
            matching = [
                name
                for name in zf.namelist()
                if any(pattern in name.lower() for pattern in level_patterns)
                and name.endswith(".geojson")
                and "_em" not in name.lower()
                and "lines" not in name.lower()
                and "points" not in name.lower()
            ]

            if not matching:
                print(
                    f"  WARNING: No adm{level} GeoJSON found in archive for {country}"
                )
                continue

            filename = matching[0]
            output_file = DATA_DIR / f"{country}_adm{level}.json"
            temporary_file = output_file.with_suffix(".json.part")
            with zf.open(filename) as source, open(temporary_file, "wb") as destination:
                shutil.copyfileobj(source, destination)
            temporary_file.replace(output_file)
            print(f"  -- Extracted {filename} -> {output_file}")


def extract_shp_levels(
    zip_bytes: bytes,
    country: str,
    needed_levels: list[int],
) -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            zf.extractall(tmppath)

        for level in needed_levels:
            level_patterns = (f"adm{level}", f"admin{level}")
            shp_files = [
                p
                for p in tmppath.glob("**/*.shp")
                if any(pattern in p.stem.lower() for pattern in level_patterns)
                and "lines" not in p.stem.lower()
                and "points" not in p.stem.lower()
            ]

            if not shp_files:
                print(f"  WARNING: No adm{level} SHP found in archive for {country}")
                continue

            shp_path = shp_files[0]
            features = []
            with fiona.open(shp_path) as src:
                for feat in src:
                    features.append(
                        {
                            "type": "Feature",
                            "properties": dict(feat["properties"]),
                            "geometry": dict(feat["geometry"]),
                        }
                    )

            geojson_data = {"type": "FeatureCollection", "features": features}
            output_file = DATA_DIR / f"{country}_adm{level}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(geojson_data, f, indent=2, ensure_ascii=False)
            print(f"  -- Converted {shp_path.name} -> {output_file}")


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    hdx_countries = get_countries_for_source(AdminAreaSource.HDX)
    for country, levels in hdx_countries.items():
        dataset_id = HDX_DATASET_IDS.get(country)
        if not dataset_id:
            print(f"  ERROR: No HDX dataset ID configured for {country}")
            continue

        print(f"Fetching {country} from HDX dataset '{dataset_id}'...")
        url, fmt = get_download_url(dataset_id)
        print(f"  Downloading {fmt} from {url}")

        response = requests.get(url, timeout=120)
        response.raise_for_status()

        if fmt == "geojson":
            extract_geojson_levels(response.content, country, levels)
        elif fmt == "shp":
            extract_shp_levels(response.content, country, levels)
