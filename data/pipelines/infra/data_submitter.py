from __future__ import annotations

import json
import logging
import os
import shutil
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone

from pipelines.infra.data_types.alert_types import (
    Alert,
    Centroid,
    EnsembleMemberType,
    ExposureAdminArea,
    ExposureGeoFeature,
    ExposureRaster,
    ForecastSource,
    HazardType,
    Layer,
    RasterExtent,
    Severity,
    TimeInterval,
)
from pipelines.infra.data_types.data_config_types import OutputMode
from pipelines.infra.utils.alert_integrity_checks import (
    check_admin_area_integrity,
    check_centroid,
    check_raster_integrity,
    check_severity_integrity,
)
from pipelines.infra.utils.api_client import ApiClient

logger = logging.getLogger(__name__)


class DataSubmitter:
    def __init__(self) -> None:
        self._alerts: dict[str, Alert] = {}
        self.errors: dict[str, str] = {}

    def add_error(self, error: str) -> None:
        self.errors[f"manual:{len(self.errors)}"] = error

    def create_alert(
        self,
        alert_name: str,
        hazard_types: list[HazardType],
        centroid: Centroid,
        issued_at: datetime,
        forecast_sources: list[ForecastSource],
    ) -> None:
        if alert_name in self._alerts:
            self.errors[f"create_alert:{alert_name}"] = (
                f"Alert '{alert_name}' already exists"
            )
            return

        if not hazard_types:
            self.errors[f"create_alert:{alert_name}"] = (
                f"Alert '{alert_name}' has no hazard_types"
            )
            return

        if not forecast_sources:
            self.errors[f"create_alert:{alert_name}"] = (
                f"Alert '{alert_name}' has no forecast_sources"
            )
            return

        if issued_at.tzinfo is None:
            self.errors[f"create_alert:{alert_name}"] = (
                f"Alert '{alert_name}' issued_at must be timezone-aware"
            )
            return

        self._alerts[alert_name] = Alert(
            alert_name=alert_name,
            issued_at=issued_at.astimezone(timezone.utc),
            centroid=centroid,
            hazard_types=hazard_types,
            forecast_sources=forecast_sources,
        )

    def _get_alert(self, alert_name: str, caller: str) -> Alert | None:
        if alert_name not in self._alerts:
            self.errors[f"{caller}:{alert_name}"] = f"Alert '{alert_name}' not found"
            return None
        return self._alerts[alert_name]

    def add_severity_data(
        self,
        alert_name: str,
        time_interval_start: str,
        time_interval_end: str,
        ensemble_member_type: EnsembleMemberType,
        severity_key: str,
        severity_value: float | int,
    ) -> None:
        alert = self._get_alert(alert_name, "add_severity_data")
        if alert is None:
            return

        alert.severity.append(
            Severity(
                time_interval=TimeInterval(
                    start=time_interval_start, end=time_interval_end
                ),
                ensemble_member_type=ensemble_member_type,
                severity_key=severity_key,
                severity_value=severity_value,
            )
        )

    def add_admin_area_exposure(
        self,
        alert_name: str,
        place_code: str,
        admin_level: int,
        layer: Layer,
        value: bool | int | float,
    ) -> None:
        alert = self._get_alert(alert_name, "add_admin_area_exposure")
        if alert is None:
            return

        alert.exposure.admin_areas.append(
            ExposureAdminArea(
                place_code=place_code,
                admin_level=admin_level,
                layer=layer,
                value=value,
            )
        )

    def add_geo_feature_exposure(
        self,
        alert_name: str,
        geo_feature_id: str,
        layer: str,
        value: dict[str, bool | str | int | float],
    ) -> None:
        alert = self._get_alert(alert_name, "add_geo_feature_exposure")
        if alert is None:
            return

        alert.exposure.geo_features.append(
            ExposureGeoFeature(geo_feature_id=geo_feature_id, layer=layer, value=value)
        )

    def add_raster_exposure(
        self,
        alert_name: str,
        layer: str,
        value: str,
        extent: dict[str, float],
    ) -> None:
        alert = self._get_alert(alert_name, "add_raster_exposure")
        if alert is None:
            return

        alert.exposure.rasters.append(
            ExposureRaster(
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

    def get_alerts(self) -> list[Alert]:
        return list(self._alerts.values())

    def send_all(self, output_mode: OutputMode, output_path: str) -> list[str]:
        integrity_errors = self._check_integrity()
        if integrity_errors:
            for err in integrity_errors:
                logger.error(f"Integrity error: {err}")
            return integrity_errors

        alerts_list = [alert.to_dict() for alert in self._alerts.values()]

        file_errors = self._write_to_file(alerts_list, output_path)

        if output_mode == OutputMode.API:
            if file_errors:
                logger.warning(f"Local debug write failed: {file_errors}")
            api_errors = self._send_to_api(alerts_list)
            if not api_errors:
                shutil.rmtree(output_path, ignore_errors=True)
                logger.info(f"Cleaned up local output at {output_path}")
            return api_errors

        return file_errors

    def _write_to_file(
        self, alerts_list: Sequence[Mapping[str, object]], output_dir: str
    ) -> list[str]:
        try:
            os.makedirs(output_dir, exist_ok=True)
            file_path = os.path.join(output_dir, "alerts_object.json")
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(list(alerts_list), f, indent=2)
        except OSError as e:
            return [f"Failed to write alerts to {output_dir}: {e}"]

        logger.info(f"Wrote {len(alerts_list)} alerts to {file_path}")
        return []

    def _send_to_api(self, alerts_list: Sequence[Mapping[str, object]]) -> list[str]:
        api_base_url = os.environ.get("IBF_API_URL", "")
        if not api_base_url:
            return ["IBF_API_URL environment variable must be set for api output mode"]

        try:
            client = ApiClient(api_base_url)
        except ValueError as e:
            return [str(e)]

        return client.submit_alerts(alerts_list)

    def _check_integrity(self) -> list[str]:
        errors: list[str] = []

        if not self._alerts:
            errors.append("No alerts to submit")
            return errors

        # NOTE 1: exact data formats (and thus these integrity checks) are subject to change based on back-and-forth between hazard-logic & pipeline-infra (and exact API/datamodel requirements)
        # NOTE 2: a lot more checks could be added and will be added in the future, but for now we focus on a few key ones to demonstrate the concept
        for alert_name, alert in self._alerts.items():
            # NOTE: this validation mimics the validation on the API-side. Make sure to keep this in sync.
            errors.extend(check_centroid(alert_name, alert.centroid))
            errors.extend(check_severity_integrity(alert_name, alert))
            errors.extend(check_admin_area_integrity(alert_name, alert))
            errors.extend(check_raster_integrity(alert_name, alert))

        return errors
