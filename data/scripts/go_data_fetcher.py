"""
This script fetches the various country data and feature data from the IFRC GO API
"""

from pathlib import Path
from shared.download_helpers import download_json_source

# Dict of output filenames and data query sources
sources = {
    "hospital_locs": "https://goadmin.ifrc.org/api/v2/health-local-units/?limit=99999",
    "country_overview": "https://goadmin.ifrc.org/api/v2/country/?limit=99999",
    "rc_locs": "https://goadmin.ifrc.org/api/v2/public-local-units/?limit=99999",
    "admin2_overview": "https://goadmin.ifrc.org/api/v2/admin2/?limit=99999",
    "admin1_overview": "https://goadmin.ifrc.org/api/v2/district/?limit=99999",
}

# Create Data directory if it doesn't exist
data_dir = Path(__file__).parent / "../country-overview"
data_dir.mkdir(exist_ok=True)

if __name__ == "__main__":
    for name, url in sources.items():
        download_json_source(name, url, data_dir)