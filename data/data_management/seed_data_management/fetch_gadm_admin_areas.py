"""
Fetch the admin areas for indicated countries.
You can select the target admin levels, and target countries by editing
this file and the references in the shared data_helpers file.
You can iterate on the enum CountryCodeIso3 to fetch data for all countries.
"""

import json
from pathlib import Path

from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.download_helpers import download_json_source

"""
Get the url for the given country's admin area.
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

    # Fetch and save each file immediately after download
    for country in target_countries_iso_a3:
        for admin_level in target_admin_levels:
            name = f"{country}_adm{admin_level}"
            url = get_url(country, admin_level)
            data = download_json_source(url, check_count=False)

            if data is None:
                print(f"  -- Error: Failed to download {name} from {url}")
                continue

            output_file = DATA_DIR / f"{name}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                # ensure_ascii=False to preserve non-ASCII chars
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  -- Data saved to {output_file}")
