"""
This script fetches the various country data and feature data from the IFRC GO API
"""

import json
from pathlib import Path
from shared.data_helpers import get_seed_data_repo_path
from shared.download_helpers import download_json_source
from pydantic import BaseModel

# Dict of output filenames and data query sources
sources = {
    "hospital_locs": "https://goadmin.ifrc.org/api/v2/health-local-units/?limit=99999",
    "country_overview": "https://goadmin.ifrc.org/api/v2/country/?limit=99999",
    "rc_locs": "https://goadmin.ifrc.org/api/v2/public-local-units/?limit=99999",
    "admin2_overview": "https://goadmin.ifrc.org/api/v2/admin2/?limit=99999",
    "admin1_overview": "https://goadmin.ifrc.org/api/v2/district/?limit=99999",
}

class ExtentData(BaseModel):
    name_en: str
    admin_level: int
    iso: str
    code: str
    center: list[float]
    extents: list[float]

def get_extent_data(admin_level : int, source):
    output = {}

    # make a list of ExtenData based on the source data
    # The admin level is added from the above arg admin_level
    # For admin level 0, if ISO is null, skip. Also write ISO as both code and iso.
    # write the name/country name as name_en
    # For center, get the 2 floats from "centroid"
    # for extents, there are 5 points in bbox. Get only the first 4
    # example output is in the file in comments. "See Sample Admin level 0", etc.
    # full sample data is in ../sampledata/
    return output

#Sample Admin level 0
"""
      "iso": "AF",
      "iso3": "AFG",
      "bbox": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              60.503889000065236,
              29.377476867128088
            ],
            [
              74.87943118675915,
              29.377476867128088
            ],
            [
              74.87943118675915,
              38.48893683918417
            ],
            [
              60.503889000065236,
              38.48893683918417
            ],
            [
              60.503889000065236,
              29.377476867128088
            ]
          ]
        ]
      },
      "centroid": {
        "type": "Point",
        "coordinates": [
          67.709953,
          33.93911
        ]
      },
      "name": "Afghanistan"
"""

#Sample Admin level 1
"""

      "name": "Ordino",
      "code": "AD001",
      "country_iso": "AD",
      "country_iso3": "AND",
      "bbox": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              1.45964684658635,
              42.5517616271341
            ],
            [
              1.60640966847476,
              42.5517616271341
            ],
            [
              1.60640966847476,
              42.6587066652962
            ],
            [
              1.45964684658635,
              42.6587066652962
            ],
            [
              1.45964684658635,
              42.5517616271341
            ]
          ]
        ]
      },
      "centroid": {
        "type": "Point",
        "coordinates": [
          1.531076061808509,
          42.61149239930336
        ]
      },
      """
#Sample Admin level 2
"""

      "name": "Kabul",
      "code": "AF0101",
      "bbox": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              68.9910513780001,
              34.4254471610001
            ],
            [
              69.340645695,
              34.4254471610001
            ],
            [
              69.340645695,
              34.6451104010001
            ],
            [
              68.9910513780001,
              34.6451104010001
            ],
            [
              68.9910513780001,
              34.4254471610001
            ]
          ]
        ]
      },
      "centroid": {
        "type": "Point",
        "coordinates": [
          69.13517911835672,
          34.52543790036686
        ]
      },
    },
"""

# Create Data directory if it doesn't exist
BASE_REPO_DIR = get_seed_data_repo_path()
DATA_DIR = Path(BASE_REPO_DIR) / "temp"

def get_zoom_extents():
    return 0

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
    

    # Save to file, overwriting the existing file
    for name, data in output_data.items():
        output_file = DATA_DIR / f"{name}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            # ensure_ascii=False to preserve non-ASCII chars
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  -- Data saved to {output_file}")