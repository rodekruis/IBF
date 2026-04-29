from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

# Pyright cannot enforce recursive JSON types due to dict invariance.
# This alias documents the intent: values are JSON-serializable primitives, lists, or dicts.
JsonDict = dict[str, object]


@dataclass
class Centroid:
    latitude: float
    longitude: float

    def to_dict(self) -> dict[str, float]:
        return {"latitude": self.latitude, "longitude": self.longitude}


@dataclass
class TimeInterval:
    start: str
    end: str

    def to_dict(self) -> dict[str, str]:
        return {"start": self.start, "end": self.end}


class EnsembleMemberType(StrEnum):
    MEDIAN = "median"
    RUN = "run"


class HazardType(StrEnum):
    FLOODS = "floods"
    DROUGHT = "drought"


# This enforces that alert event names follow the pattern "{countryCodeISO3}_{hazardType}_{identifier}", where the latter can consist of any number of parts
# Keep in line with definition in alerts.service.ts
EVENT_NAME_PATTERN = re.compile(
    r"^[A-Z]{3}_(" + "|".join(re.escape(h.value) for h in HazardType) + r")_.+$"
)


class ForecastSource(StrEnum):
    GLOFAS = "glofas"
    ECMWF = "ECMWF"


class Layer(StrEnum):
    ALERT_EXTENT = "alert_extent"
    POPULATION_EXPOSED = "population_exposed"


@dataclass
class Severity:
    time_interval: TimeInterval
    ensemble_member_type: EnsembleMemberType
    severity_key: str
    severity_value: float | int

    def to_dict(self) -> dict[str, str | float | int | dict[str, str]]:
        return {
            "timeInterval": self.time_interval.to_dict(),
            "ensembleMemberType": self.ensemble_member_type,
            "severityKey": self.severity_key,
            "severityValue": self.severity_value,
        }


@dataclass
class ExposureAdminArea:
    place_code: str
    admin_level: int
    layer: Layer
    value: bool | int | float

    def to_dict(self) -> dict[str, str | int | float]:
        return {
            "placeCode": self.place_code,
            "adminLevel": self.admin_level,
            "layer": self.layer,
            "value": int(self.value) if isinstance(self.value, bool) else self.value,
        }


@dataclass
class ExposureGeoFeature:
    geo_feature_id: str
    layer: str
    value: dict[str, bool | str | int | float]

    def to_dict(self) -> dict[str, str | dict[str, bool | str | int | float]]:
        return {
            "geoFeatureId": self.geo_feature_id,
            "layer": self.layer,
            "attributes": self.value,
        }


@dataclass
class RasterExtent:
    xmin: float
    ymin: float
    xmax: float
    ymax: float

    def to_dict(self) -> dict[str, float]:
        return {
            "xmin": self.xmin,
            "ymin": self.ymin,
            "xmax": self.xmax,
            "ymax": self.ymax,
        }


@dataclass
class ExposureRaster:
    layer: str
    value: str
    extent: RasterExtent

    def to_dict(self) -> dict[str, str | dict[str, float]]:
        return {
            "layer": self.layer,
            "value": self.value,
            "extent": self.extent.to_dict(),
        }


@dataclass
class Exposure:
    admin_areas: list[ExposureAdminArea] = field(default_factory=list)
    geo_features: list[ExposureGeoFeature] = field(default_factory=list)
    rasters: list[ExposureRaster] = field(default_factory=list)

    def to_dict(
        self,
    ) -> JsonDict:
        return {
            "adminAreas": [item.to_dict() for item in self.admin_areas],
            "geoFeatures": [item.to_dict() for item in self.geo_features],
            "rasters": [item.to_dict() for item in self.rasters],
        }


@dataclass
class Alert:
    event_name: str
    centroid: Centroid
    severity: list[Severity] = field(default_factory=list)
    exposure: Exposure = field(default_factory=Exposure)

    def to_dict(
        self,
    ) -> JsonDict:
        return {
            "eventName": self.event_name,
            "centroid": self.centroid.to_dict(),
            "severity": [entry.to_dict() for entry in self.severity],
            "exposure": self.exposure.to_dict(),
        }


@dataclass
class Forecast:
    issued_at: datetime
    hazard_type: HazardType
    forecast_sources: list[ForecastSource]
    alerts: list[Alert] = field(default_factory=list)

    def to_dict(self) -> dict[str, str | list[str] | list[dict]]:
        return {
            "issuedAt": self.issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "hazardType": str(self.hazard_type),
            "forecastSources": list(self.forecast_sources),
            "alerts": [alert.to_dict() for alert in self.alerts],
        }
