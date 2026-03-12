"""
Admin Boundaries Table Creation
Loads UGA_*.json files and creates a PostGIS-enabled table with MultiPolygon geometries.
"""
import json
import os
import glob
from pathlib import Path
from data_management.utils.postgis_handler import get_db_connection, create_table, create_index
from shared.data_helpers import get_seed_data_repo_path

# Configuration
TABLE_NAME = "admin_boundaries_2"
FILE_PATTERN = "MWI*.json"

# Input dir
BASE_REPO_DIR = get_seed_data_repo_path()
INPUT_DIR = Path(BASE_REPO_DIR) / "admin-areas/"

def load_admin_boundaries_data(json_dir):
    json_pattern = os.path.join(json_dir, FILE_PATTERN)
    json_files = glob.glob(json_pattern)
    
    print(f"Found {len(json_files)} JSON files:")
    for f in json_files:
        print(f"  - {os.path.basename(f)}")
    print("\n" + "="*50 + "\n")
    
    all_features = []
    for json_file in json_files:
        # Extract admin level from filename (e.g., UGA_adm3.json -> 3)
        basename = os.path.basename(json_file)
        filename = basename.replace('.json', '')

        try:
            admin_level = int(filename.split('_adm')[-1])
        except Exception as e:
            print(f"Error: Could not get admin level from filename '{basename}' - Error: {e}")
            continue
        
        print(f"Loading {basename} (level: {admin_level})...")
        
        with open(json_file, 'r') as f:
            geojson_data = json.load(f)
            
            if geojson_data.get('type') != 'FeatureCollection':
                print(f"  WARNING: {basename} is not a FeatureCollection, skipping...")
                continue
            
            features = geojson_data.get('features', [])
            file_count = 0
            
            for feature in features:
                feature_data = {
                    'admin_level': admin_level,
                    'properties': feature.get('properties', {}),
                    'geometry': feature.get('geometry', {})
                }
                all_features.append(feature_data)
                file_count += 1
            
            print(f"  Loaded {file_count} features")
    
    print(f"\nTotal features loaded: {len(all_features)}")
    print("\n" + "="*50 + "\n")
    
    return all_features

def create_admin_boundaries_table(connection):
    """
    Create the admin_boundaries table with spatial capabilities.
    
    Args:
        conn: Database connection object
    """
    columns = {
        'id': 'SERIAL PRIMARY KEY',
        'country': 'VARCHAR(3)',
        'admin_level': 'SMALLINT',
        'name_en': 'VARCHAR(255)',
        'code': 'VARCHAR(10)',
        'geom': 'GEOMETRY(MultiPolygon, 4326)'
    }
    
    create_table(connection, TABLE_NAME, columns)


def insert_admin_boundaries_data(conn, features):
    """
    Insert admin boundary feature data into the table.
    
    Args:
        conn: Database connection object
        features: List of feature dictionaries containing the data
    """
    with conn.cursor() as cur:
        for feature in features:
            props = feature['properties']
            geom = feature['geometry']

            admin_level = feature.get('admin_level')

            if not admin_level:
                print(f"Error: No admin level from file attached to {props}.")
                continue

            name = props.get('ADM0_EN') or props.get('ADM1_EN') or props.get('ADM2_EN') or props.get('ADM3_EN') or None
            code = props.get('ADM0_PCODE') or props.get('ADM1_PCODE') or props.get('ADM2_PCODE') or props.get('ADM3_PCODE') or None
            
            if not name or not code:
                print(f"Error: could not parse: {props}.")
                continue

            try:
                country = code[:2]
            except Exception as e:
                print(f"Error: Invalid code for '{code}' from {props} - Error: {e}")
                continue

            # The length of the code indicates the admin level.
            # i.e. NL1234 is "NL 12 34"
            try:
                admin_level = (len(code) / 2) - 1
            except Exception as e:
                print(f"Error: Invalid code for '{code}' from {props} - Error: {e}")
                continue


            
            # Convert geometry to GeoJSON string
            geom_json = json.dumps(geom)

            query = f"""
                INSERT INTO {TABLE_NAME}
                (country, admin_level, name_en, code, geom)
                VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
            """
            
            cur.execute(query, (
                country,
                admin_level,
                name,
                code,
                geom_json
            ))
        conn.commit()
    print(f"Inserted {len(features)} features into the table!")


def verify_data(conn):
    """
    Query and print sample records to verify the data was inserted correctly.
    
    Args:
        conn: Database connection object
    """
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT id, country, admin_level, name_en, code, 
                   ST_GeometryType(geom) as geom_type, ST_NumGeometries(geom) as num_geoms
            FROM {TABLE_NAME} 
            LIMIT 3;
        """)
        records = cur.fetchall()
        print("\nSample records from the database:")
        for record in records:
            print(record)


def create_admin_boundaries_tables():
    """
    Main function to create the admin_boundaries table.
    Loads GeoJSON data, creates table, inserts data, and creates spatial index.
    """
    print("="*50)
    print("Creating Admin Boundaries Table")
    print("="*50 + "\n")

    # Load data from JSON files
    features = load_admin_boundaries_data(INPUT_DIR)
    
    if not features:
        print("No features loaded. Exiting.")
        return
    
    # Connect to database and create table
    with get_db_connection() as conn:        
        # Create table if needed
        create_admin_boundaries_table(conn)
        
        # Insert data
        insert_admin_boundaries_data(conn, features)
        
        # Create spatial index
        create_index(conn, TABLE_NAME)
        
        # Verify data
        verify_data(conn)
    
    print("\nDatabase connection closed.")
    print("\n" + "="*50)
    print("Your data is now available in pg-featureserv!")
    print("Access it at:")
    print(f"  Collection: http://localhost:9000/collections/public.{TABLE_NAME}")
    print(f"  Items: http://localhost:9000/collections/public.{TABLE_NAME}/items")
    print("  Web UI: http://localhost:9000/index.html")
    print("="*50)


if __name__ == "__main__":
    create_admin_boundaries_tables()



