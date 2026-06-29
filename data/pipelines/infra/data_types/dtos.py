"""
Dataclasses representing the DTOs defined in services/api-service/src/alerts/dto/
If the definitions change there, be sure to reflect the changes here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from pipelines.infra.data_types.enums import (
    EnsembleMemberType,
    ExposureIndicator,
    ForecastSource,
    HazardType,
    MapLayer,
    SeverityKey,
)

# Pyright cannot enforce recursive JSON types due to dict invariance.
# This alias documents the intent: values are JSON-serialisable primitives,
# lists, or dicts.
JsonDict = dict[str, object]

__all__ = [
    "Centroid",
    "TimeInterval",
    "Severity",
    "ExposureAdminArea",
    "ExposureGeoFeature",
    "RasterExtent",
    "ExposureRaster",
    "Exposure",
    "Alert",
    "Forecast",
]


# Source: services/api-service/src/alerts/dto/centroid.dto.ts
@dataclass
class Centroid:
    latitude: float
    longitude: float

    def to_dict(self) -> JsonDict:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


# Source: services/api-service/src/alerts/dto/time-interval.dto.ts
@dataclass
class TimeInterval:
    # Difference with the source DTO: TS DTO uses `Date` (class-transformer parses ISO
    # strings into Date). Python keeps `str` because the pipeline already produces ISO-8601
    # strings and the JSON payload is identical.
    start: str
    end: str

    def to_dict(self) -> JsonDict:
        return {
            "start": self.start,
            "end": self.end,
        }


# Source: services/api-service/src/alerts/dto/severity.dto.ts
@dataclass
class Severity:
    time_interval: TimeInterval
    ensemble_member_type: EnsembleMemberType
    severity_key: SeverityKey
    severity_value: float | int

    def to_dict(self) -> JsonDict:
        return {
            "timeInterval": self.time_interval.to_dict(),
            "ensembleMemberType": self.ensemble_member_type,
            "severityKey": self.severity_key,
            "severityValue": self.severity_value,
        }


# Source: services/api-service/src/alerts/dto/exposure-admin-area.dto.ts
@dataclass
class ExposureAdminArea:
    place_code: str
    admin_level: int
    exposure_indicator: ExposureIndicator
    value: int | float

    def to_dict(self) -> JsonDict:
        return {
            "placeCode": self.place_code,
            "adminLevel": self.admin_level,
            "exposureIndicator": self.exposure_indicator,
            "value": self.value,
        }


# Source: services/api-service/src/alerts/dto/exposure-geo-feature.dto.ts
@dataclass
class ExposureGeoFeature:
    geo_feature_id: str
    map_layer: MapLayer
    attributes: dict[str, bool | str | int | float]

    def to_dict(self) -> JsonDict:
        return {
            "geoFeatureId": self.geo_feature_id,
            "mapLayer": self.map_layer,
            "attributes": self.attributes,
        }


# Source: services/api-service/src/alerts/dto/raster-extent.dto.ts
@dataclass
class RasterExtent:
    xmin: float
    ymin: float
    xmax: float
    ymax: float

    def to_dict(self) -> JsonDict:
        return {
            "xmin": self.xmin,
            "ymin": self.ymin,
            "xmax": self.xmax,
            "ymax": self.ymax,
        }


# Source: services/api-service/src/alerts/dto/exposure-raster.dto.ts
@dataclass
class ExposureRaster:
    map_layer: MapLayer
    value_black_white: str
    extent: RasterExtent

    def to_dict(self) -> JsonDict:
        return {
            "mapLayer": self.map_layer,
            "valueBlackWhite": self.value_black_white,
            "extent": self.extent.to_dict(),
        }


# Source: services/api-service/src/alerts/dto/exposure.dto.ts
@dataclass
class Exposure:
    admin_areas: list[ExposureAdminArea] = field(default_factory=list)
    geo_features: list[ExposureGeoFeature] = field(default_factory=list)
    rasters: list[ExposureRaster] = field(default_factory=list)

    def to_dict(self) -> JsonDict:
        return {
            "adminAreas": [item.to_dict() for item in self.admin_areas],
            "geoFeatures": [item.to_dict() for item in self.geo_features],
            "rasters": [item.to_dict() for item in self.rasters],
        }


# Source: services/api-service/src/alerts/dto/alert-create.dto.ts
@dataclass
class Alert:
    event_name: str
    centroid: Centroid
    severity: list[Severity] = field(default_factory=list)
    exposure: Exposure = field(default_factory=Exposure)

    def to_dict(self) -> JsonDict:
        return {
            "eventName": self.event_name,
            "centroid": self.centroid.to_dict(),
            "severity": [item.to_dict() for item in self.severity],
            "exposure": self.exposure.to_dict(),
        }


# Source: services/api-service/src/alerts/dto/forecast-create.dto.ts
@dataclass
class Forecast:
    # Difference with the source DTO: TS DTO uses `Date`. Python keeps `datetime` and
    # serialises to the same `YYYY-MM-DDTHH:MM:SSZ` ISO format the API expects.
    issued_at: datetime
    hazard_type: HazardType
    forecast_sources: list[ForecastSource]
    alerts: list[Alert] = field(default_factory=list)

    def to_dict(self) -> JsonDict:
        return {
            "issuedAt": self.issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "hazardType": str(self.hazard_type),
            "forecastSources": [str(item) for item in self.forecast_sources],
            "alerts": [item.to_dict() for item in self.alerts],
        }
