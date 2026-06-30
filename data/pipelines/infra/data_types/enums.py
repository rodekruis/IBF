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


class HazardType(StrEnum):
    FLOODS = "floods"
    DROUGHT = "drought"


class LayerName(StrEnum):
    # --- generic layers (cross-hazard) ---
    POPULATION = "population"
    POPULATION_EXPOSED = "population_exposed"

    # --- floods-specific layers ---
    RED_CROSS_BRANCHES = "red_cross_branches"
    CLINICS = "clinics"
    FLOOD_DEPTH = "flood_depth"
    GLOFAS_STATIONS = "glofas_stations"


class SeverityKey(StrEnum):
    RETURN_PERIOD = "return_period"
    PERCENTILE = "percentile"
