from __future__ import annotations

import re

# Shared enums are generated from services/api-service/src/alerts/enum/shared-enums.ts.
# Re-exported here so existing `from ...alert_types import HazardType` imports keep working.
from pipelines.infra.data_types.enums import (
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)

# Shared data classes are generated from services/api-service/src/alerts/dto/*.dto.ts.
# Re-exported here so existing pipeline imports keep working.
# TODO: >>>>>>>> Fix imports >>>>> Do before completing this PR.',
from pipelines.infra.data_types.dtos import (
    Alert,
    Centroid,
    Exposure,
    ExposureAdminArea,
    ExposureGeoFeature,
    ExposureRaster,
    Forecast,
    JsonDict,
    RasterExtent,
    Severity,
    TimeInterval,
)

__all__ = [
    # enums
    "EnsembleMemberType",
    "ForecastSource",
    "HazardType",
    "Layer",
    # dtos
    "Alert",
    "Centroid",
    "Exposure",
    "ExposureAdminArea",
    "ExposureGeoFeature",
    "ExposureRaster",
    "Forecast",
    "JsonDict",
    "RasterExtent",
    "Severity",
    "TimeInterval",
    # local
    "EVENT_NAME_PATTERN",
]


# This enforces that alert event names follow the pattern "{countryCodeISO3}_{hazardType}_{identifier}", where the latter can consist of any number of parts
# Keep in line with definition in alerts.service.ts
EVENT_NAME_PATTERN = re.compile(
    r"^[A-Z]{3}_(" + "|".join(re.escape(h.value) for h in HazardType) + r")_.+$"
)
