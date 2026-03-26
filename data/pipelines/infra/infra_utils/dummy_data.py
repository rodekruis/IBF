# Placeholder data for developing and testing the pipeline infra end-to-end.
# Structure approximates real sources but values are synthetic. Will be replaced
# by actual data loaders (blob, url, local) in a future phase.
DUMMY_DATA: dict[str, object] = {
    "glofas_stations": [
        {
            "station_code": "glofas-station-A",
            "station_name": "Station A",
            "lat": 0.35,
            "lon": 32.60,
            "place_codes": ["place-code-1"],
        },
        {
            "station_code": "glofas-station-B",
            "station_name": "Station B",
            "lat": 1.50,
            "lon": 33.00,
            "place_codes": ["place-code-2"],
        },
    ],
    "glofas_discharge": {
        # Per station, per lead time (0-7 days), per ensemble member (50):
        # water_discharge in m³/s
        "glofas-station-A": {
            lead_time: {f"member-{m}": 80 + lead_time * 5 + m * 2 for m in range(1, 51)}
            for lead_time in range(8)
        },
        "glofas-station-B": {
            lead_time: {f"member-{m}": 40 + lead_time * 3 + m for m in range(1, 51)}
            for lead_time in range(8)
        },
    },
    "admin_boundaries": {
        # Only deepest-level entries per country.
        "place-code-1": {
            "name": "Admin Area 1",
            "admin_level": 3,
            "parent_place_code": "place-code-1-parent",
            "grandparent_place_code": "place-code-top",
            "great_grandparent_place_code": None,
            "centroid": {"lat": 0.35, "lon": 32.60},
        },
        "place-code-2": {
            "name": "Admin Area 2",
            "admin_level": 3,
            "parent_place_code": "place-code-2-parent",
            "grandparent_place_code": "place-code-top",
            "great_grandparent_place_code": None,
            "centroid": {"lat": 1.50, "lon": 33.00},
        },
        # Deepest level for drought (admin_levels: [1, 2])
        "place-code-2-parent": {
            "name": "Parent Area 2",
            "admin_level": 2,
            "parent_place_code": "place-code-top",
            "grandparent_place_code": None,
            "great_grandparent_place_code": None,
            "centroid": {"lat": 1.50, "lon": 33.00},
        },
    },
    "population": {
        # In reality a raster (GeoTIFF). Represented here as a dict of
        # cell_id -> population count to approximate zonal statistics output.
        "cells": {
            "cell-0-0": {"lat": 0.35, "lon": 32.60, "population": 1200},
            "cell-0-1": {"lat": 0.35, "lon": 32.61, "population": 800},
            "cell-1-0": {"lat": 1.50, "lon": 33.00, "population": 3500},
            "cell-1-1": {"lat": 1.50, "lon": 33.01, "population": 2100},
        },
        "metadata": {
            "crs": "EPSG:4326",
            "resolution": 0.01,
            "nodata": -1,
        },
    },
    "ecmwf_forecast": {
        # In reality a raster (GRIB/NetCDF) per ensemble member per month.
        # Represented here as nested dict: month -> ensemble_member -> cell grid
        # of rainfall anomaly (mm/month).
        "months": {
            "2026-03": {
                f"member-{m}": {
                    "cell-0-0": 45.0 + m * 0.5,
                    "cell-0-1": 42.0 + m * 0.3,
                    "cell-1-0": 60.0 + m * 0.8,
                    "cell-1-1": 55.0 + m * 0.6,
                }
                for m in range(1, 51)
            },
            "2026-04": {
                f"member-{m}": {
                    "cell-0-0": 50.0 + m * 0.4,
                    "cell-0-1": 48.0 + m * 0.2,
                    "cell-1-0": 65.0 + m * 0.7,
                    "cell-1-1": 58.0 + m * 0.5,
                }
                for m in range(1, 51)
            },
            "2026-05": {
                f"member-{m}": {
                    "cell-0-0": 55.0 + m * 0.3,
                    "cell-0-1": 52.0 + m * 0.1,
                    "cell-1-0": 70.0 + m * 0.6,
                    "cell-1-1": 62.0 + m * 0.4,
                }
                for m in range(1, 51)
            },
        },
        "metadata": {
            "crs": "EPSG:4326",
            "resolution": 0.01,
            "nodata": -9999,
            "unit": "mm/month",
        },
    },
    "climate_regions": [
        {
            "id": "climate-region-B",
            "name": "Region B",
            "seasons": ["MAM"],
            "place_codes": ["place-code-2-parent"],
        },
    ],
}
