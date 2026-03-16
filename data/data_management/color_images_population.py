"""
Colorizes greyscale PNGs that were produced by the GeoTIFF -> PNG flow
This file currently targets population data, but can be used for other rasters as the need arises.
"""

from pathlib import Path
from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.image_helpers import colorize_image_array
import shutil
from PIL import Image


# Input/Output dirs
BASE_REPO_DIR = get_seed_data_repo_path()
BASE_RASTER_DIR = "raster-data/population"
GREYSCALE_INPUT_DIR = Path(BASE_REPO_DIR) / f"{BASE_RASTER_DIR}/greyscale/"
RGBA_OUTPUT_DIR = Path(BASE_REPO_DIR) / f"{BASE_RASTER_DIR}/rgba/"

METADATA_ENDING = "_population_metadata.json"
RASTER_ENDING = "_population.png"

if __name__ == "__main__":
    GREYSCALE_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    RGBA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for country in target_countries_iso_a3:

        # open the BW image from file as binary
        bw_image_file = GREYSCALE_INPUT_DIR  / f"{country.upper()}{RASTER_ENDING}"
        print (f"Reading file from {bw_image_file}")
        if not bw_image_file.exists():
            print(f"Error: image file {bw_image_file} does not exist. Skipping {country}.")
            continue

        bin_object = bw_image_file.read_bytes()

        # convert to color
        color_image_data = colorize_image_array(bin_object, [0,200,0,0], [100,100,255,255], log_scale=True)

        # Write image as color PNG
        color_path = RGBA_OUTPUT_DIR / f"{country}{RASTER_ENDING}"
        color_img = Image.fromarray(color_image_data, mode='RGBA')
        color_img.save(color_path, optimize=True)

        # Copy metadata file from the bw dir to the color dir
        # No changes are needed on the metadata
        metadata_file = GREYSCALE_INPUT_DIR / f"{country.upper()}{METADATA_ENDING}"
        if metadata_file.exists():
            new_metadata_file = RGBA_OUTPUT_DIR / f"{country.upper()}{METADATA_ENDING}"
            shutil.copy(metadata_file, new_metadata_file)
        else:
            print(f"Warning: Metadata file {metadata_file} does not exist. Skipping metadata copy for {country}.")
