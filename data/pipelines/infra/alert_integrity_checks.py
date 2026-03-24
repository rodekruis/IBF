from __future__ import annotations

from datetime import datetime

from pipelines.infra.alert_types import Alert, Centroid, EnsembleMemberType, Layer


def check_centroid(alert_name: str, centroid: Centroid) -> list[str]:
    errors: list[str] = []
    if not (-90 <= centroid.latitude <= 90):
        errors.append(
            f"Alert '{alert_name}' centroid: latitude {centroid.latitude} "
            f"out of range [-90, 90]"
        )
    if not (-180 <= centroid.longitude <= 180):
        errors.append(
            f"Alert '{alert_name}' centroid: longitude {centroid.longitude} "
            f"out of range [-180, 180]"
        )
    return errors


def check_severity_integrity(alert_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []
    if not alert.severity_data:
        errors.append(f"Alert '{alert_name}' has no severity data")
        return errors  # return early since no data

    lead_times: dict[tuple[str, str], list[EnsembleMemberType]] = {}
    for entry in alert.severity_data:
        key = (entry.lead_time.start, entry.lead_time.end)
        lead_times.setdefault(key, []).append(entry.ensemble_member_type)

    for (start, end), types in lead_times.items():
        if datetime.fromisoformat(start) >= datetime.fromisoformat(end):
            errors.append(
                f"Alert '{alert_name}' lead time {start}–{end}: "
                f"start must be before end"
            )
        # TODO: maybe also check that start and end relate to a day for floods and a season for droughts? So generically to the 'temporal unit' defined for a hazard type?
        median_count = types.count(EnsembleMemberType.MEDIAN)
        ensemble_count = types.count(EnsembleMemberType.RUN)
        if median_count != 1:
            errors.append(
                f"Alert '{alert_name}' lead time {start}–{end}: "
                f"expected 1 median record, found {median_count}"
            )
        if ensemble_count < 1:
            errors.append(
                f"Alert '{alert_name}' lead time {start}–{end}: "
                f"expected at least 1 ensemble-run record, found 0"
            )
    return errors


def check_admin_area_integrity(alert_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []

    if not alert.exposure.admin_area:
        errors.append(f"Alert '{alert_name}' admin-area: expected at least 1 record")
        return errors

    levels: dict[int, dict[Layer, int]] = {}
    for entry in alert.exposure.admin_area:
        level_layers = levels.setdefault(entry.admin_level, {})
        level_layers[entry.layer] = level_layers.get(entry.layer, 0) + 1

    admin_area_required = (Layer.SPATIAL_EXTENT, Layer.POPULATION_EXPOSED)
    for level, layer_counts in sorted(levels.items()):
        for required in admin_area_required:
            if required not in layer_counts:
                errors.append(
                    f"Alert '{alert_name}' admin-area level {level}: "
                    f"missing required layer '{required}'"
                )

        counts = list(layer_counts.values())
        if len(set(counts)) > 1:
            detail = ", ".join(
                f"{layer}={count}" for layer, count in layer_counts.items()
            )
            errors.append(
                f"Alert '{alert_name}' admin-area level {level}: "
                f"record count differs across layers ({detail})"
            )

    return errors


def check_raster_integrity(alert_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []
    raster_layers = {r.layer for r in alert.exposure.rasters}
    if Layer.ALERT_EXTENT not in raster_layers:
        errors.append(
            f"Alert '{alert_name}' rasters: missing required 'alert_extent' layer"
        )
    for raster in alert.exposure.rasters:
        ext = raster.extent
        if ext.xmin >= ext.xmax or ext.ymin >= ext.ymax:
            errors.append(
                f"Alert '{alert_name}' raster '{raster.layer}': "
                f"invalid extent (xmin={ext.xmin}, ymin={ext.ymin}, "
                f"xmax={ext.xmax}, ymax={ext.ymax})"
            )
    return errors
