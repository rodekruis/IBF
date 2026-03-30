"""
Upload all admin area extents from a local clone of the seed-data repo

TODO: This table format is used for development purposes, and we may need
a different table or different data structure/preprocessing for MVP.

Example URI (for Malawi):
http://localhost:9000/collections/debug.extents_data/items?filter=country%3D%27MW%27
"""

import glob
import json
import os
from pathlib import Path

from data_management.utils.postgis_handler import (
    create_gis_index,
    create_gis_table,
    get_db_connection,
)
from shared.data_helpers import get_seed_data_repo_path

# Table config
TABLE_NAME = "debug.extents_data"

COL_COUNTRY = "country"
COL_ADMIN_LEVEL = "admin_level"
COL_NAME_EN = "name_en"
COL_CODE = "code"
COL_GEOM = "geom"
COL_EXTENTS = "extents"

EPSG_PROJECTION = 4326

ADMIN_TABLE_COLUMNS = {
    "id": "SERIAL PRIMARY KEY",
    COL_COUNTRY: "VARCHAR(2)",
    COL_ADMIN_LEVEL: "SMALLINT",
    COL_NAME_EN: "VARCHAR(255)",
    COL_CODE: "VARCHAR(64)",
    COL_GEOM: f"GEOMETRY(Point, {EPSG_PROJECTION})",
    COL_EXTENTS: "DOUBLE PRECISION[][]",
}

# Input
BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "country-data/go-data"
FILE_PATTERN = "admin*.json"


def load_extent_data(json_dir):
    """
    Load extent data from JSON files in the specified directory.
    Each file contains a list of extent objects.
    This function returns a list of extent data objects from all files,
    with country (iso), admin_level, name_en, code, center, and extents.
    """
    json_pattern = os.path.join(json_dir, FILE_PATTERN)
    json_files = sorted(glob.glob(json_pattern))

    print(f"Found {len(json_files)} JSON files to process.")

    parsed_data = []

    for json_file in json_files:
        filename = os.path.basename(json_file)
        print(f"Parsing {filename}...")

        try:
            with open(json_file, "r") as f:
                data = json.load(f)

                # If the file contains a list, try to get extent data
                if isinstance(data, list):
                    for item in data:
                        # Skip if ISO is missing or code is 'N.A'
                        # 'N.A' is used in the source data to mark non-country extents
                        if not item.get("iso") or item.get("code") == "N.A":
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
            country = extent.get("iso")
            admin_level = extent.get("admin_level")
            name_en = extent.get("name_en")
            code = extent.get("code")
            center = extent.get("center")  # [lon, lat]
            extents_bbox = extent.get("extents")

            if not all(
                [country, admin_level is not None, name_en, code, center, extents_bbox]
            ):
                print(f"Error: Missing required fields in {extent}")
                continue

            lon, lat = center[0], center[1]

            # Insert into the table
            query = f"""
                INSERT INTO {TABLE_NAME}
                ({COL_COUNTRY}, {COL_ADMIN_LEVEL}, {COL_NAME_EN}, {COL_CODE}, {COL_GEOM}, {COL_EXTENTS})
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), {EPSG_PROJECTION}),
                    %s
                )
            """

            try:
                cur.execute(
                    query, (country, admin_level, name_en, code, lon, lat, extents_bbox)
                )
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
        # Create table if it doesn't exist and insert data
        create_gis_table(connection, TABLE_NAME, ADMIN_TABLE_COLUMNS)
        insert_extent_data(connection, extent_data)
        create_gis_index(connection, TABLE_NAME)

    print(f"Finished uploading data to {TABLE_NAME}.")
