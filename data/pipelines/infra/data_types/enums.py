# AUTO-GENERATED from services/api-service/src/alerts/enum/*.enum.ts -- DO NOT EDIT.
# Run `npm run gen:enums` (from the repo root) to regenerate.

"""Shared enums consumed by the pipeline code.

Do not edit by hand; regenerate via `npm run gen:enums` from the repo root.
"""

from enum import StrEnum


class HazardType(StrEnum):
    FLOODS = "floods"
    DROUGHT = "drought"


class ForecastSource(StrEnum):
    GLOFAS = "glofas"
    ECMWF = "ECMWF"


class Layer(StrEnum):
    ALERT_EXTENT = "alert_extent"
    POPULATION_EXPOSED = "population_exposed"
    GLOFAS_STATIONS = "glofas_stations"


class EnsembleMemberType(StrEnum):
    MEDIAN = "median"
    RUN = "run"
