"""
Upload all admin areas from a local clone of the seed-data repo

TODO: This table format is used for development purposes, and we may need
a different table or different data structure/preprocessing for MVP,
such as including extent data here.

Example URI (for Uganda):
http://localhost:9000/collections/debug.admin_areas/items?filter=country=%27UG%27&limit=10000&transform=simplify,0.005`;
"""

import glob
import json
import os
from pathlib import Path

from data_management.utils.geo_utils import normalize_polygon_to_multipolygon
from data_management.utils.postgis_handler import (
    create_gis_index,
    create_gis_table,
    get_db_connection,
)
from shared.data_helpers import get_seed_data_repo_path

# Table config
TABLE_NAME = "debug.admin_areas"

COL_COUNTRY = "country"
COL_ADMIN_LEVEL = "admin_level"
COL_NAME_EN = "name_en"
COL_CODE = "code"
COL_GEOM = "geom"

EPSG_PROJECTION = 4326

ADMIN_TABLE_COLUMNS = {
    "id": "SERIAL PRIMARY KEY",
    COL_COUNTRY: "VARCHAR(2)",
    COL_ADMIN_LEVEL: "SMALLINT",
    COL_NAME_EN: "VARCHAR(255)",
    COL_CODE: "VARCHAR(64)",
    COL_GEOM: f"GEOMETRY(MultiPolygon, {EPSG_PROJECTION})",
}

# Input
BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas" / "processed"
FILE_PATTERN = "*.json"


def load_admin_areas_data(json_dir):
    """
    Load the admin level, country name, and all features from the GeoJSON files
    """
    json_pattern = os.path.join(json_dir, FILE_PATTERN)
    json_files = glob.glob(json_pattern)

    print(f"Found {len(json_files)} GeoJSON files to process.")

    # parsed data for all areas (called features in the JSON) for all files
    parsed_data = []

    for json_file in json_files:
        # Extract admin level from filename (e.g., UGA_adm3.json -> 3)
        basename = os.path.basename(json_file)
        filename = basename.replace(".json", "")

        try:
            admin_level = int(filename.split("_adm")[-1])
        except Exception as e:
            print(
                f"Error: Could not get admin level from filename '{basename}' - Error: {e}"
            )
            continue

        print(f"Parsing {basename} (level: {admin_level})...")

        with open(json_file, "r") as f:
            geojson_data = json.load(f)

            if geojson_data.get("type") != "FeatureCollection":
                print(f"ERROR: {basename} is not a FeatureCollection.")
                continue

            features = geojson_data.get("features", [])

            # For each feature, add the needed data to the output, along with the admin level
            for feature in features:
                normalized_geometry = normalize_polygon_to_multipolygon(
                    feature.get("geometry", {})
                )
                parsed_admin_area = {
                    "admin_level": admin_level,
                    "properties": feature.get("properties", {}),
                    "geometry": normalized_geometry,
                }
                parsed_data.append(parsed_admin_area)

    return parsed_data


def insert_admin_areas_data(connection, features: list[dict]):
    """
    Insert all admin area features into the table.
    """
    with connection.cursor() as cur:
        for feature in features:
            props = feature["properties"]
            geom = feature["geometry"]

            admin_level = feature.get("admin_level")

            if not admin_level:
                print(f"Error: No admin level from file attached to {props}.")
                continue

            # Name and code are called different things in different admin levels,
            # but there is only one in each feature. Get any, with the most granular level grabbed first.
            name = (
                props.get("ADM4_EN")
                or props.get("ADM3_EN")
                or props.get("ADM2_EN")
                or props.get("ADM1_EN")
                or props.get("ADM0_EN")
                or None
            )
            code = (
                props.get("ADM4_PCODE")
                or props.get("ADM3_PCODE")
                or props.get("ADM2_PCODE")
                or props.get("ADM1_PCODE")
                or props.get("ADM0_PCODE")
                or None
            )

            if not name or not code:
                print(f"Error: could not parse: {props}.")
                continue

            # Try to get the two-letter country code (first two letters of the code)
            try:
                country = code[:2]
            except Exception as e:
                print(f"Error: Invalid code for '{code}' from {props} - Error: {e}")
                continue

            # Convert geometry to GeoJSON string
            geom_json = json.dumps(geom)

            # Insert into the table
            # .   ST_SetSRID: Sets the spatial reference ID (SRID) for the geometry
            query = f"""
                INSERT INTO {TABLE_NAME}
                ({COL_COUNTRY}, {COL_ADMIN_LEVEL}, {COL_NAME_EN}, {COL_CODE}, {COL_GEOM})
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    ST_SetSRID(ST_GeomFromGeoJSON(%s), {EPSG_PROJECTION})
                )
            """
            try:
                cur.execute(query, (country, admin_level, name, code, geom_json))
            except Exception as e:
                print(f"Error inserting feature with properties {props} - Error: {e}")
                return

        connection.commit()

    print(f"Table insertion complete: {len(features)} features added")


def verify_data(connection):
    """
    Query and print sample records to verify the data was inserted correctly.
    """
    with connection.cursor() as cur:
        cur.execute(f"""
            SELECT id,  {COL_COUNTRY}, {COL_ADMIN_LEVEL}, {COL_NAME_EN}, {COL_CODE},
                   ST_GeometryType({COL_GEOM}) as geom_type, ST_NumGeometries({COL_GEOM}) as num_geoms
            FROM {TABLE_NAME}
            LIMIT 3;
        """)
        records = cur.fetchall()
        print("\nSample records from the database:")
        for record in records:
            print(record)


def create_admin_areas_tables():
    """
    Main function to create the admin areas table.
    Loads GeoJSON data, creates table, inserts data, and creates spatial index.
    """

    # Load data from JSON files
    features = load_admin_areas_data(INPUT_DIR)
    if not features:
        print("No features loaded. Exiting.")
        return

    # Connect to database and create table
    with get_db_connection() as connection:
        # Create table if needed, insert data, and create spatial index
        create_gis_table(connection, TABLE_NAME, ADMIN_TABLE_COLUMNS)
        insert_admin_areas_data(connection, features)
        create_gis_index(connection, TABLE_NAME)

        # Verify data
        verify_data(connection)

    print("\nDatabase connection closed.")


if __name__ == "__main__":
    create_admin_areas_tables()
