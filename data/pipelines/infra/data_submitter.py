from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from pipelines.infra.alert_types import (
    AdminAreaExposure,
    AdminAreaLayer,
    Alert,
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    GeoFeatureExposure,
    HazardType,
    LeadTime,
    RasterExposure,
    RasterExtent,
    TimeSeriesEntry,
)
from pipelines.infra.integrity_checks import (
    check_admin_area_integrity,
    check_centroid,
    check_raster_integrity,
    check_timeseries_integrity,
)

logger = logging.getLogger(__name__)


class DataSubmitter:
    def __init__(self) -> None:
        self._alerts: dict[str, Alert] = {}
        self.errors: dict[str, str] = {}

    def create_alert(
        self,
        alert_id: str,
        hazard_types: list[HazardType],
        centroid: Centroid,
        issued_at: datetime,
        forecast_sources: list[ForecastSource],
    ) -> None:
        if alert_id in self._alerts:
            self.errors[f"create_alert:{alert_id}"] = (
                f"Alert '{alert_id}' already exists"
            )
            return

        if not hazard_types:
            self.errors[f"create_alert:{alert_id}"] = (
                f"Alert '{alert_id}' has no hazard_types"
            )
            return

        if not forecast_sources:
            self.errors[f"create_alert:{alert_id}"] = (
                f"Alert '{alert_id}' has no forecast_sources"
            )
            return

        if issued_at.tzinfo is None:
            self.errors[f"create_alert:{alert_id}"] = (
                f"Alert '{alert_id}' issued_at must be timezone-aware"
            )
            return

        self._alerts[alert_id] = Alert(
            alert_id=alert_id,
            issued_at=issued_at.astimezone(timezone.utc),
            centroid=centroid,
            hazard_types=hazard_types,
            forecast_sources=forecast_sources,
        )

    def _get_alert(self, alert_id: str, caller: str) -> Alert | None:
        if alert_id not in self._alerts:
            self.errors[f"{caller}:{alert_id}"] = f"Alert '{alert_id}' not found"
            return None
        return self._alerts[alert_id]

    def add_timeseries_data(
        self,
        alert_id: str,
        lead_time_start: str,
        lead_time_end: str,
        ensemble_member_type: EnsembleMemberType,
        severity_key: str,
        severity_value: float | int,
    ) -> None:
        alert = self._get_alert(alert_id, "add_timeseries_data")
        if alert is None:
            return

        alert.time_series_data.append(
            TimeSeriesEntry(
                lead_time=LeadTime(start=lead_time_start, end=lead_time_end),
                ensemble_member_type=ensemble_member_type,
                severity_key=severity_key,
                severity_value=severity_value,
            )
        )

    def add_admin_area_exposure(
        self,
        alert_id: str,
        place_code: str,
        layer: AdminAreaLayer,
        value: bool | int | float,
    ) -> None:
        alert = self._get_alert(alert_id, "add_admin_area_exposure")
        if alert is None:
            return

        alert.exposure.admin_area.append(
            AdminAreaExposure(place_code=place_code, layer=layer, value=value)
        )

    def add_geo_feature_exposure(
        self,
        alert_id: str,
        geo_feature_id: str,
        layer: str,
        value: dict[str, bool | str | int | float],
    ) -> None:
        alert = self._get_alert(alert_id, "add_geo_feature_exposure")
        if alert is None:
            return

        alert.exposure.geo_features.append(
            GeoFeatureExposure(geo_feature_id=geo_feature_id, layer=layer, value=value)
        )

    def add_raster_exposure(
        self,
        alert_id: str,
        layer: str,
        value: str,
        extent: dict[str, float],
    ) -> None:
        alert = self._get_alert(alert_id, "add_raster_exposure")
        if alert is None:
            return

        alert.exposure.rasters.append(
            RasterExposure(
                layer=layer,
                value=value,
                extent=RasterExtent(
                    xmin=extent["xmin"],
                    ymin=extent["ymin"],
                    xmax=extent["xmax"],
                    ymax=extent["ymax"],
                ),
            )
        )

    def send_all(self, output_dir: str) -> list[str]:
        integrity_errors = self._check_integrity()
        if integrity_errors:
            for err in integrity_errors:
                logger.error(f"Integrity error: {err}")
            return integrity_errors

        # TODO: this for now writes to file instead of sending to an API
        os.makedirs(output_dir, exist_ok=True)

        alerts_list = [alert.to_dict() for alert in self._alerts.values()]
        output_path = os.path.join(output_dir, "alerts_object.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(alerts_list, f, indent=2)

        logger.info(f"Wrote {len(alerts_list)} alerts to {output_path}")
        return []

    def _check_integrity(self) -> list[str]:
        errors: list[str] = []

        if not self._alerts:
            errors.append("No alerts to submit")
            return errors

        # NOTE 1: exact data formats (and thus these integrity checks) are subject to change based on back-and-forth between hazard-logic & pipeline-infra (and exact API/datamodel requirements)
        # NOTE 2: a lot more checks could be added and will be added in the future, but for now we focus on a few key ones to demonstrate the concept
        for alert_id, alert in self._alerts.items():
            errors.extend(check_centroid(alert_id, alert.centroid))
            errors.extend(check_timeseries_integrity(alert_id, alert))
            errors.extend(check_admin_area_integrity(alert_id, alert))
            errors.extend(check_raster_integrity(alert_id, alert))

        return errors

    @staticmethod
    def _check_centroid(alert_id: str, centroid: Centroid) -> list[str]:
        errors: list[str] = []
        if not (-90 <= centroid.latitude <= 90):
            errors.append(
                f"Alert '{alert_id}' centroid: latitude {centroid.latitude} "
                f"out of range [-90, 90]"
            )
        if not (-180 <= centroid.longitude <= 180):
            errors.append(
                f"Alert '{alert_id}' centroid: longitude {centroid.longitude} "
                f"out of range [-180, 180]"
            )
        return errors

    @staticmethod
    def _check_timeseries_integrity(alert_id: str, alert: Alert) -> list[str]:
        if not alert.time_series_data:
            return [f"Alert '{alert_id}' has no time series data"]

        errors: list[str] = []
        lead_times: dict[tuple[str, str], list[EnsembleMemberType]] = {}
        for entry in alert.time_series_data:
            key = (entry.lead_time.start, entry.lead_time.end)
            lead_times.setdefault(key, []).append(entry.ensemble_member_type)

        for (start, end), types in lead_times.items():
            if datetime.fromisoformat(start) >= datetime.fromisoformat(end):
                errors.append(
                    f"Alert '{alert_id}' lead time {start}–{end}: "
                    f"start must be before end"
                )
            # TODO: maybe also check that start and end relate to a day for floods and a season for droughts? So generically to the 'temporal unit' defined for a hazard type?
            median_count = types.count(EnsembleMemberType.MEDIAN)
            ensemble_count = types.count(EnsembleMemberType.RUN)
            if median_count != 1:
                errors.append(
                    f"Alert '{alert_id}' lead time {start}–{end}: "
                    f"expected 1 median record, found {median_count}"
                )
            if ensemble_count < 1:
                errors.append(
                    f"Alert '{alert_id}' lead time {start}–{end}: "
                    f"expected at least 1 ensemble-run record, found 0"
                )
        return errors

    @staticmethod
    def _check_admin_area_integrity(alert_id: str, alert: Alert) -> list[str]:
        errors: list[str] = []

        if not alert.exposure.admin_area:
            errors.append(f"Alert '{alert_id}' admin-area: expected at least 1 record")
            return errors

        layers: dict[AdminAreaLayer, int] = {}
        for entry in alert.exposure.admin_area:
            layers[entry.layer] = layers.get(entry.layer, 0) + 1

        for required in AdminAreaLayer:
            if required not in layers:
                errors.append(
                    f"Alert '{alert_id}' admin-area: "
                    f"missing required layer '{required.value}'"
                )

        counts = list(layers.values())
        if len(set(counts)) > 1:
            detail = ", ".join(
                f"{layer.value}={count}" for layer, count in layers.items()
            )
            errors.append(
                f"Alert '{alert_id}' admin-area: record count differs "
                f"across layers ({detail})"
            )
        return errors

    @staticmethod
    def _check_raster_integrity(alert_id: str, alert: Alert) -> list[str]:
        errors: list[str] = []
        raster_layers = {r.layer for r in alert.exposure.rasters}
        if "alert_extent" not in raster_layers:
            errors.append(
                f"Alert '{alert_id}' rasters: missing required 'alert_extent' layer"
            )
        for raster in alert.exposure.rasters:
            ext = raster.extent
            if ext.xmin >= ext.xmax or ext.ymin >= ext.ymax:
                errors.append(
                    f"Alert '{alert_id}' raster '{raster.layer}': "
                    f"invalid extent (xmin={ext.xmin}, ymin={ext.ymin}, "
                    f"xmax={ext.xmax}, ymax={ext.ymax})"
                )
        return errors
