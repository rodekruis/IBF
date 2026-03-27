"""
This script fetches the population raster data from the WorldPop dataset.
The frontend uses PNG in EPSG:3857, so this script also converts the files for that step as well.
The geo metadata is saved as JSON.
This WorldPop-based source is currently the active population data source for seed data.
TODO: Periodically re-evaluate this source and update the configuration or documentation if the chosen dataset changes.
"""

import json
from pathlib import Path

from PIL import Image
from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.download_helpers import download_object
from shared.image_helpers import geotiff_to_array

# URL for the population data
# If a new model comes out, update this.
# See the WorldPop website for more information:
# https://hub.worldpop.org/project/list
# https://data.worldpop.org/GIS/Population/Global_2015_2030/
WORLDPOP_RELEASE = "R2025A"
WORLDPOP_YEAR = "2026"  # TODO: should we dynamically update this somehow?
WORLDPOP_VERSION = "v1"
WORLDPOP_RESOLUTION = "100m"
BASE_URL = (
    "https://data.worldpop.org/GIS/Population/Global_2015_2030/"
    f"{WORLDPOP_RELEASE}/{WORLDPOP_YEAR}/"
)

# Output dirs
BASE_REPO_DIR = get_seed_data_repo_path()
GREYSCALE_OUTPUT_DIR = Path(BASE_REPO_DIR) / "raster-data/population/greyscale/"


def get_url(country_iso_a3):
    country_upper = country_iso_a3.upper()
    country_lower = country_iso_a3.lower()
    return (
        f"{BASE_URL}{country_upper}/{WORLDPOP_VERSION}/{WORLDPOP_RESOLUTION}/constrained/"
        f"{country_lower}_pop_{WORLDPOP_YEAR}_CN_{WORLDPOP_RESOLUTION}_{WORLDPOP_RELEASE}_{WORLDPOP_VERSION}.tif"
    )


if __name__ == "__main__":
    GREYSCALE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Dictionary of export file names, with the source URL
    urls = {
        f"{country}_population": get_url(country) for country in target_countries_iso_a3
    }
    for name, url in urls.items():
        # Download the raw file
        bin_object = download_object(url)

        # Convert and save it to PNG
        if bin_object:
            # NOTE: uncomment to save the original tiff file as well (used for updating v1 source data). These .tif's are too big to upload to seed-data repo.
            # tiff_path = GREYSCALE_OUTPUT_DIR / f"{name}.tif"
            # with open(tiff_path, "wb") as f:
            #     f.write(bin_object)

            meta_data, img_data = geotiff_to_array(bin_object)

            # Write metadata as JSON
            json_path = GREYSCALE_OUTPUT_DIR / f"{name}_metadata.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(meta_data, f, indent=2)

            # Write image as BW PNG
            bw_path = GREYSCALE_OUTPUT_DIR / f"{name}.png"
            bw_img = Image.fromarray(img_data, mode="L")
            bw_img.save(bw_path, optimize=True)
        else:
            print(f"Error: Failed to download data for {name} from {url}")
