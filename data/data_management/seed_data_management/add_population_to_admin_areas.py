"""
This file compares admin area polygons with the population raster and
computes the population for each admin area, writing the output to the
admin area data.

Each admin level is computed independently.
Since there can be some errors in the admin boundaries, especially at lower levels,
if you summed the computed population of child areas, and passed those values up to the parent,
you might inflate errors.
Since this does not sum up them, there is a chance the sum of child admin area do not exactly
match the parent admin area population.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
from rasterio.transform import Affine
from rasterstats import zonal_stats
from shared.data_helpers import get_seed_data_repo_path
from shared.image_helpers import rgba_png_to_float_array

BASE_SEED_REPO_DIR = get_seed_data_repo_path()
# This dir is both the input and output dir for admin areas
# Data is in AdminAreaFeatureCollection format
ADMIN_AREAS_DIR = Path(BASE_SEED_REPO_DIR) / "admin-areas" / "processed"
# Population rasters, as PNGs converted from GeoTIFFs
DATA_PNG_OUTPUT_DIR = Path(BASE_SEED_REPO_DIR) / "raster-data/population/data-png/"

POPULATION_PNG_SUFFIX = "_population.png"
POPULATION_METADATA_SUFFIX = "_population_metadata.json"
ADMIN_AREA_FILE_PATTERN = re.compile(r"^(?P<country>[A-Z]{3})_adm(?P<level>\d+)\.json$")


def get_population_countries() -> set[str]:
    """Return ISO-A3 country codes that have a population PNG file available."""
    return {
        path.name.removesuffix(POPULATION_PNG_SUFFIX)
        for path in DATA_PNG_OUTPUT_DIR.glob(f"*{POPULATION_PNG_SUFFIX}")
    }


def get_admin_area_files_by_country() -> dict[str, list[Path]]:
    """Return admin-area file paths grouped by country, sorted by admin level."""
    files_by_country: dict[str, list[tuple[int, Path]]] = defaultdict(list)
    for path in ADMIN_AREAS_DIR.glob("*_adm*.json"):
        match = ADMIN_AREA_FILE_PATTERN.match(path.name)
        if not match:
            continue
        country = match.group("country")
        level = int(match.group("level"))
        files_by_country[country].append((level, path))

    return {
        country: [path for _, path in sorted(entries, key=lambda item: item[0])]
        for country, entries in files_by_country.items()
    }


def load_population_raster(country: str) -> tuple[np.ndarray, Affine]:
    png_path = DATA_PNG_OUTPUT_DIR / f"{country}{POPULATION_PNG_SUFFIX}"
    metadata_path = DATA_PNG_OUTPUT_DIR / f"{country}{POPULATION_METADATA_SUFFIX}"

    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata file: {metadata_path}")

    population_array = rgba_png_to_float_array(png_path.read_bytes())

    with open(metadata_path, encoding="utf-8") as f:
        metadata = json.load(f)

    # Create an affine transform from the metadata.
    # Only the first 6 numbers are needed.
    a, b, c, d, e, f = metadata["transform"][:6]
    affine = Affine(a, b, c, d, e, f)

    return population_array, affine


def add_population_to_admin_file(
    admin_file: Path, population_array: np.ndarray, affine: Affine
) -> None:
    """
    Compute the population for each feature and write the result to the admin json data.
    """

    with open(admin_file, encoding="utf-8") as f:
        feature_collection = json.load(f)

    features = feature_collection.get("features", [])
    if not features:
        print(f"  WARNING: No features found in {admin_file.name}, skipping")
        return

    geometries = [feature["geometry"] for feature in features]

    # Sum of the decoded pixel values that are within each polygon
    stats = zonal_stats(
        geometries,
        population_array,
        affine=affine,
        stats=["sum"],
        nodata=0,
        all_touched=False,
        geojson_out=False,
    )

    # Assign the population value to the admin area property.
    # Round the population to an int, or set to None if no data.
    for feature, stat in zip(features, stats):
        total = stat.get("sum") if stat is not None else None
        feature.setdefault("properties", {})["POPULATION"] = (
            int(round(total)) if total is not None else None
        )

    with open(admin_file, "w", encoding="utf-8") as f:
        json.dump(feature_collection, f, indent=2, ensure_ascii=False)

    print(f"  Updated {admin_file.name} ({len(features)} features)")


def process_all() -> None:
    # Get files
    population_countries = get_population_countries()
    admin_files_by_country = get_admin_area_files_by_country()
    admin_countries = set(admin_files_by_country.keys())

    # Check if there are missing countries from either set
    # Print errors for these
    only_population = sorted(population_countries - admin_countries)
    only_admin = sorted(admin_countries - population_countries)
    for country in only_population:
        print(f"ERROR: Country '{country}' has population data but no admin area files")
    for country in only_admin:
        print(f"ERROR: Country '{country}' has admin area files but no population data")

    # Only process countries with both population and admin area data
    common_countries = sorted(population_countries & admin_countries)
    print(f"Processing {len(common_countries)} countries with both data sets")

    # Process all
    for country in common_countries:
        print(f"Processing {country}...")
        population_array, affine = load_population_raster(country)
        for admin_file in admin_files_by_country[country]:
            add_population_to_admin_file(admin_file, population_array, affine)


if __name__ == "__main__":
    process_all()
