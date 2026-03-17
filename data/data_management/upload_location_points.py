"""
Upload all admin boundary extents from a local clone of the seed-data repo
"""

import json
import os
import glob
from pathlib import Path
from data_management.utils.postgis_handler import (
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


# open all files, make table, parse the json and insert the relevant data into PostGIS. 
# Use upload_admin_boundary.py as an example of what to do. here.
# See sample json below.
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


def load_extent_data(json_dir):
    """
    Load extent data from JSON files in the specified directory.
    Returns a list of extent data objects with country (iso), admin_level, name_en, code, center, and extents.
    """
    json_pattern = os.path.join(json_dir, FILE_PATTERN)
    json_files = sorted(glob.glob(json_pattern))

    print(f"Found {len(json_files)} JSON files to process.")

    parsed_data = []

    for json_file in json_files:
        filename = os.path.basename(json_file)
        print(f"Parsing {filename}...")

        try:
            with open(json_file, 'r') as f:
                data = json.load(f)

                # Each file contains a list of extent objects
                if isinstance(data, list):
                    for item in data:
                        # Skip if ISO is missing or code is 'N.A'
                        if not item.get('iso') or item.get('code') == 'N.A':
                            continue
                        parsed_data.append(item)
                else:
                    print(f"Warning: {filename} is not a list. Skipping.")
                    continue
        except Exception as e:
            print(f"Error: Could not parse {filename} - Error: {e}")
            continue

    return parsed_data


def insert_extent_data(connection, extents_list: list[dict]):
    """
    Insert extent data into the extents_data table.
    """
    with connection.cursor() as cur:
        for extent in extents_list:
            country = extent.get('iso')
            admin_level = extent.get('admin_level')
            name_en = extent.get('name_en')
            code = extent.get('code')
            center = extent.get('center')
            extents_bbox = extent.get('extents')

            if not all([country, admin_level is not None, name_en, code, center, extents_bbox]):
                print(f"Error: Missing required fields in {extent}")
                continue

            # Insert into the table
            query = f"""
                INSERT INTO {TABLE_NAME} 
                ({COL_COUNTRY}, {COL_ADMIN_LEVEL}, {COL_NAME_EN}, {COL_CODE}, {COL_CENTER}, {COL_EXTENTS})
                VALUES (%s, %s, %s, %s, %s, %s)
            """

            try:
                cur.execute(query, (country, admin_level, name_en, code, center, extents_bbox))
            except Exception as e:
                print(f"Error: Could not insert {name_en} ({code}) - Error: {e}")
                continue

    connection.commit()


if __name__ == "__main__":
    # Load extent data from JSON files
    extent_data = load_extent_data(INPUT_DIR)
    print(f"Loaded {len(extent_data)} extent items.")
    # Get database connection
    with get_db_connection() as connection:

        # Create table if it doesn't exist
        create_gis_table(connection, TABLE_NAME, ADMIN_TABLE_COLUMNS)

        # Insert data into the database
        insert_extent_data(connection, extent_data)

    print(f"Finished inserting extent data into {TABLE_NAME}.")

