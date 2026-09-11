"""
Fetch the admin areas from GADM for countries/levels configured to use GADM.
See https://gadm.org/data.html for more info.
"""

import json
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    AdminAreaSource,
    GADM_VERSION,
    get_countries_for_source,
)
from shared.data_helpers import get_seed_data_repo_path
from shared.download_helpers import download_json_source


def get_url(country_code: str, admin_level: int) -> str:
    return f"https://geodata.ucdavis.edu/gadm/gadm{GADM_VERSION}/json/gadm41_{country_code}_{admin_level}.json"


BASE_REPO_DIR = get_seed_data_repo_path()
DATA_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "sources" / "gadm"

if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    gadm_countries = get_countries_for_source(AdminAreaSource.GADM)
    for country, levels in gadm_countries.items():
        for admin_level in levels:
            name = f"{country}_adm{admin_level}"
            url = get_url(country, admin_level)
            data = download_json_source(url, check_count=False)

            if data is None:
                print(f"  -- Error: Failed to download {name} from {url}")
                continue

            output_file = DATA_DIR / f"{name}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  -- Data saved to {output_file}")
