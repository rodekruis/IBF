"""
Helper files and functions for data scripts
"""

import os
from pathlib import Path
from dotenv import load_dotenv

"""
A limited list of countries to fetch data for (if we are not already grabbing global data).
"""
target_countries_iso_a3 = {
    # Note : this list is limited for dev work so we don't slow ourselves down with too much data.
    # Add more as needed.
    "ETH", "KEN", "MWI", "PHL", "ZMB"
}

"""
Get the root dir of the local IBF-seed-data repo so files can be written there.
This looks for the SEED_DATA_REPO_ROOT var in the /data/.env dir
"""
def get_seed_data_repo_path():
    env_path = Path(__file__).parent / "../.env"
    load_dotenv(env_path)

    seed_data_repo_root = os.environ.get("SEED_DATA_REPO_ROOT")

    if not seed_data_repo_root:
        raise RuntimeError("SEED_DATA_REPO_ROOT is not set. See the readme for more info")
    
    resolved_path = (env_path.parent / seed_data_repo_root).resolve()

    if not resolved_path.exists() or not resolved_path.is_dir():
        raise RuntimeError(f"Could not resolve seed data repo path: {resolved_path}")

    print(f"Seed data repo path used as: {resolved_path}")
    return resolved_path
