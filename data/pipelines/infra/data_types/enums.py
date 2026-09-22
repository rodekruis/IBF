"""
AUTO-GENERATED code from services/api-service/src/shared-enums.ts

These are the enums shared between the API service and the pipeline code.
Run `npm run generate:python` (from the repo root) to regenerate.
"""

from enum import StrEnum


class EnsembleMemberType(StrEnum):
    MEDIAN = "median"
    RUN = "run"


class ForecastSource(StrEnum):
    GLOFAS = "glofas"
    ECMWF = "ECMWF"
    GEFS = "GEFS"
    COMPOUND_FLOODS_SOURCE = "compoundFloodsSource"


class HazardType(StrEnum):
    FLOODS = "floods"
    DROUGHT = "drought"
    TROPICAL_CYCLONE = "tropicalCyclone"
    COMPOUND_FLOODS = "compoundFloods"


class LayerName(StrEnum):
    # --- generic layers (cross-hazard) ---
    POPULATION_DENSITY = "populationDensity"
    EXPOSED_POPULATION = "exposedPopulation"
    RED_CROSS_BRANCHES = "redCrossBranches"
    CLINICS = "clinics"

    # --- floods-specific layers ---
    FLOOD_DEPTH = "floodDepth"
    GLOFAS_STATIONS = "glofasStations"

    # --- tropical cyclone-specific layers ---
    WIND_SPEED = "windSpeed"


class SeverityKey(StrEnum):
    RETURN_PERIOD = "returnPeriod"
    PERCENTILE = "percentile"
    WIND_SPEED = "windSpeed"


class EPSG(StrEnum):
    WGS84 = "EPSG:4326"
    WEB_MERCATOR = "EPSG:3857"
