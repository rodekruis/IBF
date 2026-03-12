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
POSTGRES_HOST = "localhost"
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

def create_table(db_connection : psycopg.Connection, table_name : str, columns : dict):
    """
    Create a table with spatial capabilities.
    
    Args:
        db_connection: Database connection object
        table_name: Name of the table to create
        columns: Dictionary of column definitions (name: type)
        
    Example:
        columns = {
            'id': 'SERIAL PRIMARY KEY',
            'name': 'VARCHAR(255)',
            'lat': 'DOUBLE PRECISION',
            'lon': 'DOUBLE PRECISION',
            'geom': 'GEOMETRY(Point, 4326)'
        }
    """
    with db_connection.cursor() as cur:
        column_defs = ", ".join([f"{name} {type_}" for name, type_ in columns.items()])
        create_sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({column_defs});"
        
        cur.execute(create_sql)
        db_connection.commit()
    print(f"Table '{table_name}' created successfully!")


def create_index(db_connection : psycopg.Connection, table_name : str, geom_column : str = "geom"):
    """
    Create a spatial index on a geometry column.
    
    Args:
        db_connection: Database connection object
        table_name: Name of the table
        geom_column: Name of the geometry column (default: 'geom')
    """
    with db_connection.cursor() as cur:
        index_name = f"{table_name}_{geom_column}_idx"
        cur.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} USING GIST ({geom_column});")
        db_connection.commit()
    print(f"Spatial index created on {table_name}.{geom_column}!")
