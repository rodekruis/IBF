"""
This script colorizes grayscale PNGs that were produced by the GeoTIFF -> PNG flow in PopulationRasterFetcher.py
"""

from shared.data_helpers import target_countries_iso_a3
from shared.image_helpers import colorize_image_array
from pathlib import Path
import shutil
from PIL import Image

# Output dirs
base_output_dir = "../raster-data/population"
greyscale_output_dir = Path(__file__).parent / f"{base_output_dir}/greyscale/"
greyscale_output_dir.mkdir(parents=True, exist_ok=True)
rgba_output_dir = Path(__file__).parent / f"{base_output_dir}/rgba/"
rgba_output_dir.mkdir(parents=True, exist_ok=True)

metadata_ending = "_population_metadata.json"
raster_ending = "_population.png"

if __name__ == "__main__":

    for country in target_countries_iso_a3:

        # open the BW image from file as binary
        bw_image_file = greyscale_output_dir  / f"{country.upper()}{raster_ending}"
        print (f"Reading file from {bw_image_file}")
        if not bw_image_file.exists():
            print(f"Error: image file {bw_image_file} does not exist. Skipping {country}.")
            continue

        bin_object = bw_image_file.read_bytes()

        # convert to color
        color_image_data = colorize_image_array(bin_object, [0,200,0,0], [100,100,255,255], log_scale=True)

        # Write image as color PNG
        color_path = rgba_output_dir / f"{country}{raster_ending}"
        color_img = Image.fromarray(color_image_data, mode='RGBA')
        color_img.save(color_path, optimize=True)

        # Copy metadata file from the bw dir to the color dir
        # No changes are needed on the metadata
        metadata_file = greyscale_output_dir / f"{country.upper()}{metadata_ending}"
        if metadata_file.exists():
            new_metadata_file = rgba_output_dir / f"{country.upper()}{metadata_ending}"
            shutil.copy(metadata_file, new_metadata_file)
        else:
            print(f"Warning: Metadata file {metadata_file} does not exist. Skipping metadata copy for {country}.")
