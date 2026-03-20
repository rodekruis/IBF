from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


@dataclass
class Centroid:
    latitude: float
    longitude: float

    def to_dict(self) -> dict[str, float]:
        return {"latitude": self.latitude, "longitude": self.longitude}


@dataclass
class LeadTime:
    start: str
    end: str

    def to_dict(self) -> list[str]:
        return [self.start, self.end]


class EnsembleMemberType(StrEnum):
    MEDIAN = "median"
    RUN = "run"


class HazardType(StrEnum):
    FLOODS = "floods"
    DROUGHT = "drought"


class ForecastSource(StrEnum):
    GLOFAS = "glofas"
    ECMWF = "ECMWF"


class AdminAreaLayer(StrEnum):
    SPATIAL_EXTENT = "spatial_extent"
    POPULATION_EXPOSED = "population_exposed"


@dataclass
class TimeSeriesEntry:
    lead_time: LeadTime
    ensemble_member_type: EnsembleMemberType
    severity_key: str
    severity_value: float | int

    def to_dict(self) -> dict[str, str | float | int | list[str]]:
        return {
            "leadTime": self.lead_time.to_dict(),
            "ensembleMemberType": self.ensemble_member_type,
            "severityKey": self.severity_key,
            "severityValue": self.severity_value,
        }


@dataclass
class AdminAreaExposure:
    place_code: str
    layer: AdminAreaLayer
    value: bool | int | float

    def to_dict(self) -> dict[str, str | bool | int | float]:
        return {
            "placeCode": self.place_code,
            "layer": self.layer.value,
            "value": self.value,
        }


@dataclass
class GeoFeatureExposure:
    geo_feature_id: str
    layer: str
    value: dict[str, bool | str | int | float]

    def to_dict(self) -> dict[str, str | dict[str, bool | str | int | float]]:
        return {
            "geoFeatureId": self.geo_feature_id,
            "layer": self.layer,
            "value": self.value,
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
class RasterExposure:
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
    admin_area: list[AdminAreaExposure] = field(default_factory=list)
    geo_features: list[GeoFeatureExposure] = field(default_factory=list)
    rasters: list[RasterExposure] = field(default_factory=list)

    def to_dict(
        self,
    ) -> dict[str, list[dict[str, str | bool | int | float | dict[str, float]]]]:
        return {
            "admin-area": [item.to_dict() for item in self.admin_area],
            "geo-features": [item.to_dict() for item in self.geo_features],
            "rasters": [item.to_dict() for item in self.rasters],
        }


@dataclass
class Alert:
    alert_id: str
    issued_at: datetime
    centroid: Centroid
    hazard_types: list[HazardType]
    forecast_sources: list[ForecastSource] = field(default_factory=list)
    time_series_data: list[TimeSeriesEntry] = field(default_factory=list)
    exposure: Exposure = field(default_factory=Exposure)

    def to_dict(
        self,
    ) -> dict[
        str,
        str
        | list[str]
        | dict[str, float]
        | list[dict[str, str | float | int | list[str]]]
        | dict[str, list[dict[str, str | bool | int | float | dict[str, float]]]],
    ]:
        return {
            "alertId": self.alert_id,
            "issuedAt": self.issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "centroid": self.centroid.to_dict(),
            "hazardTypes": list(self.hazard_types),
            "forecastSources": list(self.forecast_sources),
            "timeSeriesData": [entry.to_dict() for entry in self.time_series_data],
            "exposure": self.exposure.to_dict(),
        }
