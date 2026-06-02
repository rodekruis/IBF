"""
One-off script to convert flood extent GeoTIFFs to RGBA data PNGs for the seed repo.

Reads flood extent rasters from the seed repo at /raster-data/flood-extents/tif/
and writes data-encoded PNGs + metadata JSONs to /raster-data/flood-extents/data-png/

Usage:
    cd data
    uv run python data_management/seed_data_management/convert_flood_extents_to_png.py
"""

import json
from pathlib import Path

from PIL import Image
from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.image_helpers import geotiff_to_rgba_data_array

INPUT_DIR = Path(get_seed_data_repo_path()) / "raster-data" / "flood-extents" / "tif"
OUTPUT_DIR = (
    Path(get_seed_data_repo_path()) / "raster-data" / "flood-extents" / "data-png"
)

COUNTRIES = sorted(target_countries_iso_a3)


def convert_flood_extent(tif_path: Path, output_name: str):
    with open(tif_path, "rb") as f:
        tif_bytes = f.read()

    metadata, rgba_array = geotiff_to_rgba_data_array(tif_bytes)

    png_path = OUTPUT_DIR / f"{output_name}.png"
    img = Image.fromarray(rgba_array, mode="RGBA")
    img.save(png_path, optimize=True)

    json_path = OUTPUT_DIR / f"{output_name}_metadata.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    file_size_mb = png_path.stat().st_size / (1024 * 1024)
    print(f"  {output_name}.png ({file_size_mb:.1f} MB)")


if __name__ == "__main__":
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for COUNTRY in COUNTRIES:
        tif_files = sorted(INPUT_DIR.glob(f"flood_map_{COUNTRY}_*.tif"))
        if not tif_files:
            print(f"No flood extent TIFFs found in {INPUT_DIR} for {COUNTRY}")
            continue

        print(f"Converting {len(tif_files)} flood extent rasters for {COUNTRY}:")
        return_periods: list[int] = []
        for tif_path in tif_files:
            stem = tif_path.stem.lower()
            suffix = stem.replace(f"flood_map_{COUNTRY.lower()}_", "")
            if suffix == "empty":
                continue
            output_name = f"{COUNTRY}_flood_extent_{suffix}"
            convert_flood_extent(tif_path, output_name)

            if suffix.startswith("rp") and suffix[2:].isdigit():
                return_periods.append(int(suffix[2:]))

        # This is needed to facilitate lazy loading only needed files in the pipeline, to save on performance
        manifest = {
            "country": COUNTRY,
            "return_periods": sorted(return_periods),
        }
        manifest_path = OUTPUT_DIR / f"{COUNTRY}_flood_extents_manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print(f"  manifest: {manifest}")

    print(f"\nOutput written to: {OUTPUT_DIR}")
