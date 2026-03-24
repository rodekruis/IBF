"""
Fetched the admin boundaries for indicated countries.
"""

import json
from pathlib import Path

from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.download_helpers import download_json_source

"""
Get the url for the given country's admin boundary.
See https://gadm.org/data.html for more info
"""


def get_url(country_code: str, admin_level: int) -> str:
    return f"https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_{country_code}_{admin_level}.json"


target_admin_levels = [0, 1, 2, 3]

# Output Dir
BASE_REPO_DIR = get_seed_data_repo_path()
DATA_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "admin-areas-gadm"

if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # make a dict of sources for each admin level for each country in target_countries_iso_a3
    # and a dict of output data with the same key
    sources = {}
    output = {}
    for country in target_countries_iso_a3:
        for admin_level in target_admin_levels:
            name = f"{country}_adm{admin_level}"
            sources[name] = get_url(country, admin_level)
            output[name] = None

    # Fetch all data
    for name, url in sources.items():
        output[name] = download_json_source(name, url, check_count=False)

    # Save to file, overwriting the existing file
    for name, data in output.items():
        output_file = DATA_DIR / f"{name}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            # ensure_ascii=False to preserve non-ASCII chars
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  -- Data saved to {output_file}")
