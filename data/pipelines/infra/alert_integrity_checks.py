from __future__ import annotations

from datetime import datetime

from pipelines.infra.alert_types import (
    AdminAreaLayer,
    Alert,
    Centroid,
    EnsembleMemberType,
)


def check_centroid(alert_id: str, centroid: Centroid) -> list[str]:
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


def check_timeseries_integrity(alert_id: str, alert: Alert) -> list[str]:
    errors: list[str] = []
    if not alert.time_series_data:
        errors.append(f"Alert '{alert_id}' has no time series data")
        return errors  # return early since no data

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


def check_admin_area_integrity(alert_id: str, alert: Alert) -> list[str]:
    errors: list[str] = []

    if not alert.exposure.admin_area:
        errors.append(f"Alert '{alert_id}' admin-area: expected at least 1 record")
        return errors

    levels: dict[int, dict[AdminAreaLayer, int]] = {}
    for entry in alert.exposure.admin_area:
        level_layers = levels.setdefault(entry.admin_level, {})
        level_layers[entry.layer] = level_layers.get(entry.layer, 0) + 1

    for level, layer_counts in sorted(levels.items()):
        for required in AdminAreaLayer:
            if required not in layer_counts:
                errors.append(
                    f"Alert '{alert_id}' admin-area level {level}: "
                    f"missing required layer '{required}'"
                )

        counts = list(layer_counts.values())
        if len(set(counts)) > 1:
            detail = ", ".join(
                f"{layer}={count}" for layer, count in layer_counts.items()
            )
            errors.append(
                f"Alert '{alert_id}' admin-area level {level}: "
                f"record count differs across layers ({detail})"
            )

    return errors


def check_raster_integrity(alert_id: str, alert: Alert) -> list[str]:
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
