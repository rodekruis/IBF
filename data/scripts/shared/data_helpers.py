"""
Helper files and functions for data scripts
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Countries we should be fetching data for.
# Note : this list is limited for dev work so we don't slow ourselves down with too much data.
target_countries_iso_a3 = {
    "KEN"
    #"ETH", "KEN", "MWI", "PHL", "ZMB"
}

def get_seed_data_repo_path():
    env_path = Path(__file__).parent / "../../.env"

    print(f"DEBUG: env_path={env_path}, exists={env_path.exists()}")
    load_result = load_dotenv(env_path)
    print(f"DEBUG: load_dotenv returned {load_result}")

    resolved_path = (env_path.parent / os.environ.get("SEED_DATA_REPO_ROOT", "")).resolve()
    print(f"Seed data repo path used as: {resolved_path}")
    return resolved_path
