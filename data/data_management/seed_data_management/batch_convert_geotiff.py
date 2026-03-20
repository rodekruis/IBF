"""
Converts a a folder of GeoTiff images into greyscale and colored PNGS.
This is used to set up test data quickly from a batch of GeoTiffs.

Change the input and output directories as needed.
This is just a seed/test data set up script and will have no use outside of dev/set up.
"""

import json
from pathlib import Path

from PIL import Image
from shared.data_helpers import get_seed_data_repo_path
from shared.image_helpers import colorize_image_array, geotiff_to_array

# Input/Output dirs
BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "temp/mock"
BASE_RASTER_DIR = "raster-data/mock-events"
GREYSCALE_OUTPUT_DIR = Path(BASE_REPO_DIR) / f"{BASE_RASTER_DIR}/greyscale/"
RGBA_OUTPUT_DIR = Path(BASE_REPO_DIR) / f"{BASE_RASTER_DIR}/rgba/"

METADATA_ENDING = "_population_metadata.json"
RASTER_ENDING = "_population.png"

if __name__ == "__main__":
    GREYSCALE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RGBA_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Get all TIFF files in the INPUT_DIR, convert them to PNG with geotiff_to_array, and write them to the output dir.
    processed = 0
    for tif_path in INPUT_DIR.glob("*.tif"):
        print(f"Opening: {tif_path}...")
        try:
            with open(tif_path, "rb") as f:

                print(f"Converting to b/w: {tif_path.stem}...")
                tif_data = f.read()
                meta_data, img_data = geotiff_to_array(tif_data)

                # Write metadata as JSON in both output dirs
                json_path = GREYSCALE_OUTPUT_DIR / f"{tif_path.stem}_metadata.json"
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(meta_data, f, indent=2)

                json_path = RGBA_OUTPUT_DIR / f"{tif_path.stem}_metadata.json"
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(meta_data, f, indent=2)

                # Write image as BW PNG
                bw_path = GREYSCALE_OUTPUT_DIR / f"{tif_path.stem}.png"
                bw_img = Image.fromarray(img_data, mode="L")
                bw_img.save(bw_path, optimize=True)

                # Convert to color and write RGBA image.
                print(f"Converting to color: {tif_path.stem}...")
                color_image_data = colorize_image_array(
                    img_data,
                    [255, 200, 0, 0],
                    [255, 0, 100, 255],
                    log_scale=True,
                )
                color_img = Image.fromarray(color_image_data, mode="RGBA")
                color_img.save(RGBA_OUTPUT_DIR / f"{tif_path.stem}.png", optimize=True)

                processed += 1
        except Exception as e:
            print(f"Error processing {tif_path}: {e}")

    print(f"Finished. Total processed: {processed}")
