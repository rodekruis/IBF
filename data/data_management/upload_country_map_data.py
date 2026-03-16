"""
Upload all admin boundaries from a local clone of the seed-data repo
"""

import json
import os
import glob
from pathlib import Path
from data_management.utils.postgis_handler import (
    create_gis_index,
    create_gis_table,
    get_db_connection,
)
from shared.data_helpers import get_seed_data_repo_path

# Table config
TABLE_NAME = "extents_data"

COL_COUNTRY = "country"
COL_ADMIN_LEVEL = "admin_level"
COL_NAME_EN = "name_en"
COL_CODE = "code"
COL_CENTER = "center"
COL_EXTENTS = "extents"

EPSG_PROJECTION = 4326

ADMIN_TABLE_COLUMNS = {
    'id': 'SERIAL PRIMARY KEY',
    COL_COUNTRY: 'VARCHAR(2)',
    COL_ADMIN_LEVEL: 'SMALLINT',
    COL_NAME_EN: 'VARCHAR(255)',
    COL_CODE: 'VARCHAR(64)',
    COL_CENTER: 'DOUBLE PRECISION[]',
    COL_EXTENTS: 'DOUBLE PRECISION[]',
}

# Input
BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "country-data/go-data"
FILE_PATTERN = "admin*.json"



#open all files, parse the json and insert the relevant data into PostGIS. See sample json below.
# country uses "iso"
## sample json :
""" 

    "name_en": "Paghman",
    "admin_level": 2,
    "iso": "AF",
    "code": "AF0102",
    "center": [
      68.9357,
      34.5417
    ],
    "extents": [
      [
        68.8328,
        34.4181
      ],
      [
        69.0534,
        34.4181
      ],
      [
        69.0534,
        34.6754
      ],
      [
        68.8328,
        34.6754
      ]
    ]
  },
  """