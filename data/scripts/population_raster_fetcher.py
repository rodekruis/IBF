"""
This script fetches the population raster data from an external source.
The frontend uses PNG in EPSG:3857, so this script also converts the files for that step as well.
The geo metadata is saved as JSON.
"""

# Add pipelines to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "pipelines"))

from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.download_helpers import download_binary_object
from pipelines.core.image_helpers import geotiff_to_array
from pathlib import Path
import json
from PIL import Image


BASE_URL = "ftp://ftp.worldpop.org/GIS/Population_Density/Global_2000_2020_1km_UNadj/2020/"

# Output dirs
BASE_REPO_DIR = get_seed_data_repo_path()
GREYSCALE_OUTPUT_DIR = Path(BASE_REPO_DIR) / "raster-data/population/greyscale/"

def get_url(country_iso_a3):
    return f"{BASE_URL}{country_iso_a3.upper()}/{country_iso_a3.lower()}_pd_2020_1km_UNadj.tif"

if __name__ == "__main__":
    GREYSCALE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Dictionary of export file names, with the source URL
    urls = {f"{country}_population" : get_url(country) for country in target_countries_iso_a3}
    for name, url in urls.items():
        # Download the raw file
        bin_object = download_binary_object(url)

        # Convert and save it to PNG
        if bin_object:
            meta_data, img_data = geotiff_to_array(bin_object)

            # Write metadata as JSON
            json_path = GREYSCALE_OUTPUT_DIR / f"{name}_metadata.json"
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, indent=2)

            # Write image as BW PNG
            bw_path = GREYSCALE_OUTPUT_DIR / f"{name}.png"
            bw_img = Image.fromarray(img_data, mode='L')
            bw_img.save(bw_path, optimize=True)
        else:
            print(f"Error: Failed to download data for {name} from {url}")

