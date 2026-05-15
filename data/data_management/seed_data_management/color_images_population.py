"""
Colorizes greyscale PNGs that were produced by the GeoTIFF -> PNG flow
This file currently targets population data, but can be used for other rasters as the need arises.
"""

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.image_helpers import colorize_image_array

# Input/Output dirs
BASE_REPO_DIR = get_seed_data_repo_path()
BASE_RASTER_DIR = "raster-data/population"
GREYSCALE_INPUT_DIR = Path(BASE_REPO_DIR) / f"{BASE_RASTER_DIR}/greyscale/"
RGBA_OUTPUT_DIR = Path(BASE_REPO_DIR) / f"{BASE_RASTER_DIR}/rgba/"

METADATA_ENDING = "_population_metadata.json"
RASTER_ENDING = "_population.png"

# Design settings:
COLOR_STEPS = 6
COLOR_START = (0, 200, 0, 0)
COLOR_END = (100, 100, 255, 255)

# Source population rasters are 100m resolution, but this makes files much too large (15MB for ETH).
# Downsample these to 1km resolution, which is 10% the data size.
DOWNSAMPLE_FACTOR = 10


if __name__ == "__main__":
    GREYSCALE_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    RGBA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for country in target_countries_iso_a3:

        # open the BW image from file as binary
        bw_image_file = GREYSCALE_INPUT_DIR / f"{country.upper()}{RASTER_ENDING}"
        print(f"Reading file from {bw_image_file}")
        if not bw_image_file.exists():
            print(
                f"Error: image file {bw_image_file} does not exist. Skipping {country}."
            )
            continue

        # Load greyscale image and downsample by average of the pixel block
        bw_img = Image.open(bw_image_file)
        if DOWNSAMPLE_FACTOR > 1:
            bw_img = bw_img.resize(
                (
                    bw_img.width // DOWNSAMPLE_FACTOR,
                    bw_img.height // DOWNSAMPLE_FACTOR,
                ),
                Image.Resampling.BILINEAR,
            )
        bw_array = np.array(bw_img, dtype=np.float32)

        # convert to color
        color_image_data = colorize_image_array(
            bw_array, COLOR_START, COLOR_END, COLOR_STEPS, log_scale=True
        )

        # Write image as color PNG
        color_path = RGBA_OUTPUT_DIR / f"{country}{RASTER_ENDING}"
        color_img = Image.fromarray(color_image_data, mode="RGBA")
        color_img.save(color_path, optimize=True)

        # Open the metadata file from the bw dir, and bring that to the color dir
        # If downsampling was done, update the needed values.
        metadata_file = GREYSCALE_INPUT_DIR / f"{country.upper()}{METADATA_ENDING}"
        if metadata_file.exists():
            new_metadata_file = RGBA_OUTPUT_DIR / f"{country.upper()}{METADATA_ENDING}"
            if DOWNSAMPLE_FACTOR > 1:
                with open(metadata_file, encoding="utf-8") as f:
                    meta = json.load(f)
                new_width, new_height = color_img.width, color_img.height
                # Scale pixel size in the affine transform: [a, b, c, d, e, f]
                # a = pixel width, e = pixel height (typically negative).
                transform = list(meta["transform"])
                transform[0] *= meta["width"] / new_width
                transform[4] *= meta["height"] / new_height
                meta["width"] = new_width
                meta["height"] = new_height
                meta["transform"] = transform
                meta["res"] = (transform[0], -transform[4])
                with open(new_metadata_file, "w", encoding="utf-8") as f:
                    json.dump(meta, f, indent=2)
            else:
                shutil.copy(metadata_file, new_metadata_file)
        else:
            print(
                f"Warning: Metadata file {metadata_file} does not exist. Skipping metadata copy for {country}."
            )
