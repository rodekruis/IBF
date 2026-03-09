"""
This script fetches the various country data and feature data from the IFRC GO API
It writes some directly to file, and processes others that need to be cleaned up.
"""

import json
from pathlib import Path
from shared.data_helpers import get_seed_data_repo_path
from shared.download_helpers import download_json_source
from pydantic import BaseModel

# Results can be larger than 26,000. Set query limit 99999 to get all. Set to lower when debugging.
results_limit = 99999

# Dict of data names and data query sources
# The data names are for our reference (and are used for the output file name).
sources = {
    "rc_locs": f"https://goadmin.ifrc.org/api/v2/public-local-units/?limit={results_limit}",
    "hospital_locs": f"https://goadmin.ifrc.org/api/v2/health-local-units/?limit={results_limit}",
    "admin0_extents": f"https://goadmin.ifrc.org/api/v2/country/?limit={results_limit}",
    "admin1_extents": f"https://goadmin.ifrc.org/api/v2/district/?limit={results_limit}",
    "admin2_extents": f"https://goadmin.ifrc.org/api/v2/admin2/?limit={results_limit}",
}

# Output Dir
BASE_REPO_DIR = get_seed_data_repo_path()
DATA_DIR = Path(BASE_REPO_DIR) / "country-data"

""" Data structure for extracting extent and center data """
class ExtentData(BaseModel):
    name_en: str
    admin_level: int
    iso: str
    code: str
    center: list[float]
    extents: list[list[float]]

"""
Extract the extent data.
Some data is missing in admin 0 and admin 1, so it needs special handling.
"""
def get_extent_data(admin_level: int, source) -> list[ExtentData]:
    output = []

    for item in source.get("results", []):
        # For admin level 0, there are lots of "Region" extents.
        # The ISO is null on those, so skip them
        # Field names also differ between admin levels.
        if admin_level == 0:
            iso = item.get("iso")
            if not iso:
                continue
            code = iso
            name_en = item.get("name", "")
        else:
            iso = item.get("country_iso") or ""
            code = item.get("code")
            name_en = item.get("name")
            if not code or not name_en:
                print(f"Warning: Skipping item with missing code or name - {item}")
                continue

        # Get center from centroid coordinates
        centroid = item.get("centroid") or {}
        center = centroid.get("coordinates")
        if not center:
            print(f"Warning: No centroid coordinates for {name_en} ({code})")
            # use default, since we can just calculate this from the extents.
            center = [0.0, 0.0]

        # Get first 4 points from bbox (5th point repeats the first)
        bbox = item.get("bbox") or {}
        coords = (bbox.get("coordinates") or [[]])[0]
        if not coords:
            # If there are coordinates here, then there is no data to extract. Skip this item.
            print(f"Warning: No bbox coordinates for {name_en} ({code})")
            continue
        extents = coords[:4]

        # Round floats to 4 decimals (about 11 meters accuracy)
        center = [round(c, 4) for c in center]
        extents = [[round(coord, 4) for coord in point] for point in extents]

        # For admin 2, there is no country code. Get it from the first two letters of the code.
        if admin_level == 2 and not iso and code and len(code) >= 2:
            iso = code[:2]

        extent_data = ExtentData(
            name_en=name_en,
            admin_level=admin_level,
            iso=iso,
            code=code,
            center=center,
            extents=extents,
        )
        
        output.append(extent_data)

    return output


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    raw_data = {}
    output_data = {}

    # Fetch all data
    for name, url in sources.items():
        raw_data[name] = download_json_source(name, url)

    # Hospital and RC locations need no processing, and can be output as is
    output_data["hospital_locs"] = raw_data["hospital_locs"]
    output_data["rc_locs"] = raw_data["rc_locs"]

    # Process extent data
    # serializable_data = [item.model_dump() for item in data]
    extent_data_0 = get_extent_data(0, raw_data["admin0_extents"])
    extent_data_1 = get_extent_data(1, raw_data["admin1_extents"])
    extent_data_2 = get_extent_data(2, raw_data["admin2_extents"])
    output_data["admin0_extents"] = [item.model_dump() for item in extent_data_0]
    output_data["admin1_extents"] = [item.model_dump() for item in extent_data_1]
    output_data["admin2_extents"] = [item.model_dump() for item in extent_data_2]
    

    # Save to file, overwriting the existing file
    for name, data in output_data.items():
        output_file = DATA_DIR / f"{name}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            # ensure_ascii=False to preserve non-ASCII chars
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  -- Data saved to {output_file}")
