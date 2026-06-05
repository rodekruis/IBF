"""
Upload all admin areas from a local clone of the seed-data repo

This script is used for development purposes. For example this is still needed for showing all countries in the world in the FE, which we do not have easily available in api-service.admin-area.
Before using this, make sure it matches the current table structure and data parsing logic.
For table DTO, see: services/api-service/src/admin-areas/dto/admin-area-create.dto.ts
For parsing json, see: services/api-service/src/admin-areas/admin-areas.service.spec.ts
You can use an LLM to update this for you by pointing it at the above instructions.

Note: The frontend uses the api endpoint wrapper targeting the standard DB table, while
this script targets a debug table that is not wrapped by the api-service.
This means that if you need to test your changes on the front end,
you would need to change the uri in the front end as well.

Example URI directly to pg_featureserv (for Uganda):
http://localhost:9000/collections/debug.admin_areas/items?filter=%22countryCodeIso3%22=%27UGA%27&limit=10000&transform=simplify,0.005`;
"""

import glob
import json
import os
from pathlib import Path

from data_management.utils.geo_utils import normalize_polygon_to_multipolygon
from data_management.utils.postgis_handler import (
    create_gis_index,
    create_gis_table,
    drop_table_if_exists,
    get_db_connection,
)
from shared.country_data import CountryCodeIso2
from shared.data_helpers import get_seed_data_repo_path

TABLE_NAME = "debug.admin_areas"

# Table config (mirrors AdminAreaCreateDto in
# services/api-service/src/admin-areas/dto/admin-area-create.dto.ts)
COL_PLACE_CODE = "placeCode"
COL_ADMIN_LEVEL = "adminLevel"
COL_NAME_EN = "nameEn"
COL_COUNTRY_CODE_ISO3 = "countryCodeIso3"
COL_PLACE_CODE_LEVEL_1 = "placeCodeLevel1"
COL_PLACE_CODE_LEVEL_2 = "placeCodeLevel2"
COL_PLACE_CODE_LEVEL_3 = "placeCodeLevel3"
COL_PLACE_CODE_LEVEL_4 = "placeCodeLevel4"
COL_ATTRIBUTES = "attributes"
COL_GEOMETRY = "geometry"

EPSG_PROJECTION = 4326

# Column identifiers are camelCase, so they must be double-quoted in SQL.
ADMIN_TABLE_COLUMNS = {
    "id": "SERIAL PRIMARY KEY",
    f'"{COL_PLACE_CODE}"': "VARCHAR(64) UNIQUE NOT NULL",
    f'"{COL_ADMIN_LEVEL}"': "SMALLINT NOT NULL",
    f'"{COL_NAME_EN}"': "VARCHAR(255) NOT NULL",
    f'"{COL_COUNTRY_CODE_ISO3}"': "VARCHAR(3) NOT NULL",
    f'"{COL_PLACE_CODE_LEVEL_1}"': "VARCHAR(64)",
    f'"{COL_PLACE_CODE_LEVEL_2}"': "VARCHAR(64)",
    f'"{COL_PLACE_CODE_LEVEL_3}"': "VARCHAR(64)",
    f'"{COL_PLACE_CODE_LEVEL_4}"': "VARCHAR(64)",
    f'"{COL_ATTRIBUTES}"': "JSONB",
    f'"{COL_GEOMETRY}"': f"GEOMETRY(MultiPolygon, {EPSG_PROJECTION})",
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


def validate_multipolygon_geometry(geometry: dict) -> str | None:
    """
    Mirror of `validateMultiPolygonGeometry` in admin-areas.repository.ts.
    Returns an error message if invalid, otherwise None.
    """
    if not isinstance(geometry, dict) or geometry.get("type") != "MultiPolygon":
        return f"Invalid geometry: expected type 'MultiPolygon', got '{geometry.get('type') if isinstance(geometry, dict) else type(geometry).__name__}'"
    if not isinstance(geometry.get("coordinates"), list):
        return "Invalid geometry: coordinates must be an array"
    return None


def insert_admin_areas_data(connection, features: list[dict]):
    """
    Insert all admin area features into the table.
    """
    with connection.cursor() as cur:
        for feature in features:
            props = feature["properties"]
            geom = feature["geometry"]

            admin_level = feature.get("admin_level")

            geometry_error = validate_multipolygon_geometry(geom)
            if geometry_error:
                admin_code = (
                    props.get(f"ADM{admin_level}_PCODE")
                    or props.get("ADM0_ISO_A3")
                    or "unknown"
                )
                print(f"Error: {admin_code}: {geometry_error}")
                continue

            if admin_level is None:
                print(f"Error: No admin level from file attached to {props}.")
                continue

            # Name and code from the feature's own admin level.
            if admin_level == 0:
                name_en = props.get("ADM0_EN")
                place_code = props.get("ADM0_ISO_A3")
            else:
                name_en = props.get(f"ADM{admin_level}_EN")
                place_code = props.get(f"ADM{admin_level}_PCODE")

            # Set all place codes present in the data
            place_code_level_1 = props.get("ADM1_PCODE")
            place_code_level_2 = props.get("ADM2_PCODE")
            place_code_level_3 = props.get("ADM3_PCODE")
            place_code_level_4 = props.get("ADM4_PCODE")

            if not name_en or not place_code:
                print(f"Error: could not parse: {props}.")
                continue

            country_code_iso3 = props.get("ADM0_ISO_A3")
            if not country_code_iso3:
                iso_a2 = props.get("ADM0_ISO_A2") or props.get("ADM0_PCODE")
                try:
                    country_code_iso3 = CountryCodeIso2(iso_a2).name
                except ValueError:
                    print(
                        f"Error: missing ADM0_ISO_A3 and could not infer from '{iso_a2}' in {props}."
                    )
                    continue

            # Free-form attributes from the source GeoJSON. POPULATION may be
            # missing or null; fall back to 0 in that case.
            population = props.get("POPULATION")
            if population is None:
                population = 0
            attributes_json = json.dumps({"POPULATION": population})

            # Convert geometry to GeoJSON string
            geom_json = json.dumps(geom)

            # Insert into the table.
            # Mirrors admin-areas.repository.ts: ST_Force2D(ST_GeomFromGeoJSON(...)).
            query = f"""
                INSERT INTO {TABLE_NAME}
                ("{COL_PLACE_CODE}", "{COL_ADMIN_LEVEL}", "{COL_NAME_EN}", "{COL_COUNTRY_CODE_ISO3}",
                 "{COL_PLACE_CODE_LEVEL_1}", "{COL_PLACE_CODE_LEVEL_2}", "{COL_PLACE_CODE_LEVEL_3}", "{COL_PLACE_CODE_LEVEL_4}",
                 "{COL_ATTRIBUTES}", "{COL_GEOMETRY}")
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s::jsonb,
                    ST_Force2D(ST_GeomFromGeoJSON(%s))
                )
            """
            try:
                cur.execute("SAVEPOINT row_insert")
                cur.execute(
                    query,
                    (
                        place_code,
                        admin_level,
                        name_en,
                        country_code_iso3,
                        place_code_level_1,
                        place_code_level_2,
                        place_code_level_3,
                        place_code_level_4,
                        attributes_json,
                        geom_json,
                    ),
                )
                cur.execute("RELEASE SAVEPOINT row_insert")
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT row_insert")
                print(f"Error inserting feature with properties {props} - Error: {e}")
                continue

        connection.commit()

    print(f"Table insertion complete: {len(features)} features added")


def verify_data(connection):
    """
    Query and print sample records to verify the data was inserted correctly.
    """
    with connection.cursor() as cur:
        cur.execute(f"""
            SELECT id, "{COL_PLACE_CODE}", "{COL_ADMIN_LEVEL}", "{COL_NAME_EN}", "{COL_COUNTRY_CODE_ISO3}",
                   "{COL_PLACE_CODE_LEVEL_1}", "{COL_PLACE_CODE_LEVEL_2}", "{COL_PLACE_CODE_LEVEL_3}", "{COL_PLACE_CODE_LEVEL_4}",
                   "{COL_ATTRIBUTES}",
                   ST_GeometryType("{COL_GEOMETRY}") as geom_type,
                   ST_NumGeometries("{COL_GEOMETRY}") as num_geoms
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
        # always drop table so you can be sure to have a clean start
        drop_table_if_exists(connection, TABLE_NAME)
        # Create table if needed, insert data, and create spatial index
        create_gis_table(connection, TABLE_NAME, ADMIN_TABLE_COLUMNS)
        insert_admin_areas_data(connection, features)
        create_gis_index(connection, TABLE_NAME, geometry_column=COL_GEOMETRY)

        # Verify data
        verify_data(connection)

    print("\nDatabase connection closed.")


if __name__ == "__main__":
    create_admin_areas_tables()
