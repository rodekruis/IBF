"""
Fetch GloFAS data for Kenya from EWDS (Early Warning Data Store) API.

API Endpoint: https://ewds.climate.copernicus.eu/api
Dataset: cems-glofas-forecast (for operational forecasts)
Dataset: cems-glofas-historical (for historical reanalysis)

EWDS dataset page: https://ewds.climate.copernicus.eu/datasets/cems-glofas-forecast
Threshold data: https://confluence.ecmwf.int/display/CEMS/Auxiliary+Data

Known GloFAS stations in Kenya:
stationCode,stationName,lat,lon,fid
G5142,ATHI MUNYU (3DA02),-1.095,37.194,G5142
G5195,NZOIA AT RUAMBWA FERRY (1EF01),0.12361,34.09028,G5195
G5305,TANA HOLA (4G04),-1.5,40.05,G5305
"""

import os
from pathlib import Path

import cdsapi
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Kenya bounding box: North, West, South, East
KENYA_BBOX = [5, 34, -5, 42]

# Output directory
OUTPUT_DIR = Path(__file__).parent / "testdata"
OUTPUT_DIR.mkdir(exist_ok=True)


def fetch_glofas_forecast():
    """
    Fetch GloFAS forecast data for Kenya from EWDS API.
    Dataset: cems-glofas-forecast
    """
    key = os.getenv("CDSAPI_KEY")
    if not key:
        raise ValueError("CDSAPI_KEY not found in environment variables")

    # EWDS API endpoint (not CDS!)
    url = "https://ewds.climate.copernicus.eu/api"

    client = cdsapi.Client(url=url, key=key)

    output_file = OUTPUT_DIR / "glofas_kenya_forecast.grib"

    print(f"Fetching GloFAS forecast for Kenya...")
    print(f"Output: {output_file}")

    # Request parameters for a minimal dataset (1 day, 1 leadtime)
    request = {
        "system_version": "operational",
        "hydrological_model": "lisflood",
        "product_type": "control_forecast",
        "variable": "river_discharge_in_the_last_24_hours",
        "year": "2026",
        "month": "03",
        "day": "26",
        "leadtime_hour": "24",
        "area": KENYA_BBOX,
        "data_format": "grib2",
    }

    client.retrieve("cems-glofas-forecast", request, str(output_file))
    print(f"Downloaded forecast to {output_file}")
    return output_file


def fetch_glofas_historical():
    """
    Fetch GloFAS historical data (reanalysis) for Kenya from EWDS API.
    Dataset: cems-glofas-historical
    """
    key = os.getenv("CDSAPI_KEY")
    if not key:
        raise ValueError("CDSAPI_KEY not found in environment variables")

    # EWDS API endpoint (not CDS!)
    url = "https://ewds.climate.copernicus.eu/api"

    client = cdsapi.Client(url=url, key=key)

    output_file = OUTPUT_DIR / "glofas_kenya_historical.grib"

    print(f"Fetching GloFAS historical data for Kenya...")
    print(f"Output: {output_file}")

    # Request parameters for a minimal dataset (1 day)
    request = {
        "system_version": "version_4_0",
        "hydrological_model": "lisflood",
        "product_type": "consolidated",
        "variable": "river_discharge_in_the_last_24_hours",
        "hyear": "2023",
        "hmonth": "january",
        "hday": "01",
        "area": KENYA_BBOX,
        "data_format": "grib2",
    }

    client.retrieve("cems-glofas-historical", request, str(output_file))
    print(f"Downloaded historical data to {output_file}")
    return output_file


if __name__ == "__main__":
    print("=" * 60)
    print("GloFAS Data Fetch for Kenya")
    print("=" * 60)

    try:
        forecast_file = fetch_glofas_forecast()
        print(f"\nForecast saved: {forecast_file}")
    except Exception as e:
        print(f"Error fetching forecast: {e}")

    print()

    try:
        historical_file = fetch_glofas_historical()
        print(f"\nHistorical saved: {historical_file}")
    except Exception as e:
        print(f"Error fetching historical: {e}")
