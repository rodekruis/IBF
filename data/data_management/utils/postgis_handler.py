"""
Utility functions for PostGIS
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg
from contextlib import contextmanager

# Load env from the <repo root>/services/.env file
env_path = Path(__file__).resolve().parents[3] / "services" / ".env"
load_dotenv(dotenv_path=env_path)

# Database connection info
# TODO: (March 2026) Re-evaluate how we get these .env vars, especially when running py scripts in PROD or PROD setup
#     See task: https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41200
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_DB = os.getenv("POSTGRES_DBNAME")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_PORT = os.getenv("POSTGRES_PORT_LOCAL")

@contextmanager
def get_db_connection():
    """
    Handles the DB connection and clean up.
    """
    db_connection = psycopg.connect(
        host=POSTGRES_HOST,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        port=POSTGRES_PORT
    )
    try:
        yield db_connection
    finally:
        db_connection.close()

def create_gis_table(db_connection : psycopg.Connection, table_name : str, columns : dict):
    """
    Create a table with GIS spatial capabilities
    TODO: (March 2026) this function and related scripts will be centralized in the future.
        See task: https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41200
    """
    with db_connection.cursor() as cur:
        column_defs = ", ".join([f"{name} {type_}" for name, type_ in columns.items()])
        create_sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({column_defs});"
        
        cur.execute(create_sql)
        db_connection.commit()
    print(f"Table '{table_name}' created")


def create_gis_index(db_connection : psycopg.Connection, table_name : str):
    """
    Create a spatial index on a geometry column.
    Run this after the initial inserting since having this index can slow down large batch inserts.
    """
    # Default name for geometry columns
    GEOMETRY_COLUMN : str = "geom"

    with db_connection.cursor() as cur:
        index_name = f"{table_name}_{GEOMETRY_COLUMN}_idx"
        cur.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} USING GIST ({GEOMETRY_COLUMN});")
        db_connection.commit()
    print(f"Spatial index created on {table_name}.{GEOMETRY_COLUMN}!")

def drop_table_if_exists(db_connection : psycopg.Connection, table_name : str):
    """
    Drop a table if it exists in the database.
    """
    with db_connection.cursor() as cur:
        cur.execute(f"DROP TABLE IF EXISTS {table_name} CASCADE;")
        db_connection.commit()
    print(f"Table '{table_name}' drop completed.")
