"""
Upload GloFAS station locations from CSV files in the seed-data repo.
"""

import csv
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
TABLE_NAME = "glofas_stations2"

COL_FID = "fid"
COL_STATION_CODE = "stationCode"
COL_STATION_NAME = "stationName"
COL_LAT = "lat"
COL_LON = "lon"
COL_COUNTRY = "country"
COL_GEOM = "geom"

EPSG_PROJECTION = 4326

TABLE_COLUMNS = {
    'id': 'SERIAL PRIMARY KEY',
    COL_FID: 'VARCHAR(50)',
    COL_STATION_CODE: 'VARCHAR(50)',
    COL_STATION_NAME: 'VARCHAR(255)',
    COL_LAT: 'DOUBLE PRECISION',
    COL_LON: 'DOUBLE PRECISION',
    COL_COUNTRY: 'VARCHAR(3)',
    COL_GEOM: f'GEOMETRY(Point, {EPSG_PROJECTION})',
}

# Input
# CSV files are named glofas_stations_<COUNTRY>.csv, e.g. glofas_stations_SEN.csv
BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "country-data/glofas-loc"
FILE_PATTERN = "glofas_stations_*.csv"


def load_glofas_data(csv_dir):
    """
    Load all glofas_stations_*.csv files from the specified directory.
    Returns a list of row dicts, each with a 'country' key derived from the filename.
    """
    csv_pattern = os.path.join(csv_dir, FILE_PATTERN)
    csv_files = sorted(glob.glob(csv_pattern))

    print(f"Found {len(csv_files)} CSV files to process.")

    all_data = []

    for csv_file in csv_files:
        basename = os.path.basename(csv_file)
        # Extract country code from filename (e.g., glofas_stations_SEN.csv -> SEN)
        country_code = basename.replace("glofas_stations_", "").replace(".csv", "")
        print(f"Parsing {basename} (country: {country_code})...")

        try:
            with open(csv_file, 'r') as f:
                csv_reader = csv.DictReader(f)
                for row in csv_reader:
                    row['country'] = country_code
                    all_data.append(row)
        except Exception as e:
            print(f"Error: Could not parse {basename} - Error: {e}")
            continue

    return all_data


def insert_glofas_data(connection, data: list[dict]):
    """
    Insert GloFAS station data into the table.
    """
    print(f"Attempting to insert {len(data)} items into {TABLE_NAME}.")
    
    with connection.cursor() as cur:
        for row in data:
            try:
                lat = round(float(row['lat']), 5) if row.get('lat') else None
                lon = round(float(row['lon']), 5) if row.get('lon') else None
            except ValueError as e:
                print(f"Error: Invalid lat/lon for {row.get('stationCode')} - Error: {e}")
                continue

            if lat is None or lon is None:
                print(f"Error: Missing lat/lon for {row.get('stationCode')}. Skipping.")
                continue

            query = f"""
                INSERT INTO {TABLE_NAME}
                ({COL_FID}, {COL_STATION_CODE}, {COL_STATION_NAME}, {COL_LAT}, {COL_LON}, {COL_COUNTRY}, {COL_GEOM})
                VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), {EPSG_PROJECTION}))
            """

            try:
                cur.execute(query, (
                    row.get('fid'),
                    row.get('stationCode'),
                    row.get('stationName'),
                    lat,
                    lon,
                    row.get('country'),
                    lon,
                    lat,
                ))
            except Exception as e:
                print(f"Error: Could not insert {row.get('stationCode')} - Error: {e}")
                continue

    connection.commit()
    print(f"Insert complete.")


def verify_data(connection):
    """
    Query and print sample records to verify the data was inserted correctly.
    """
    with connection.cursor() as cur:
        cur.execute(f"""
            SELECT {COL_FID}, {COL_STATION_CODE}, {COL_STATION_NAME}, {COL_LAT}, {COL_LON}, {COL_COUNTRY},
                   ST_AsText({COL_GEOM}) as geometry
            FROM {TABLE_NAME}
            LIMIT 3;
        """)
        records = cur.fetchall()
        print("\nSample records from the database:")
        for record in records:
            print(record)


def create_glofas_stations_table():
    """
    Main function to create the glofas_stations table.
    Loads CSV data, creates table, inserts data, and creates spatial index.
    """
    # Load data from CSV files
    data = load_glofas_data(INPUT_DIR)
    if not data:
        print("No data loaded. Exiting.")
        return

    print(f"Loaded {len(data)} records.")

    with get_db_connection() as connection:
        create_gis_table(connection, TABLE_NAME, TABLE_COLUMNS)
        insert_glofas_data(connection, data)
        create_gis_index(connection, TABLE_NAME)
        verify_data(connection)

    print(f"\nFinished uploading data to {TABLE_NAME}.")


if __name__ == "__main__":
    create_glofas_stations_table()
