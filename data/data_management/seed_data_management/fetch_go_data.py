"""
This script fetches the various country data and feature data from the IFRC GO API
and writes them directly to file
"""

import json
from pathlib import Path

from shared.data_helpers import get_seed_data_repo_path
from shared.download_helpers import download_json_source

# Results can be larger than 26,000. Set query limit 99999 to get all. Set to lower when debugging.
results_limit = 99999

# Dict of data names and data query sources
# The data names are for our reference (and are used for the output file name).
sources = {
    "rc_locs": f"https://goadmin.ifrc.org/api/v2/public-local-units/?limit={results_limit}",
    "hospital_locs": f"https://goadmin.ifrc.org/api/v2/health-local-units/?limit={results_limit}",
}

# Output Dir
BASE_REPO_DIR = get_seed_data_repo_path()
DATA_DIR = Path(BASE_REPO_DIR) / "country-data"

if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    raw_data = {}
    output_data = {}

    # Fetch all data
    for name, url in sources.items():
        data = download_json_source(url)
        if data is None:
            raise RuntimeError(
                f"Failed to load or parse JSON for '{name}' from: '{url}'"
            )
        raw_data[name] = data

    # Hospital and RC locations need no processing, and can be output as is
    output_data["hospital_locs"] = raw_data["hospital_locs"]
    output_data["rc_locs"] = raw_data["rc_locs"]

    # Save to file, overwriting the existing file
    for name, data in output_data.items():
        output_file = DATA_DIR / f"{name}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            # ensure_ascii=False to preserve non-ASCII chars
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  -- Data saved to {output_file}")
