from __future__ import annotations

import base64
import binascii
from datetime import datetime

from pipelines.infra.data_types.dtos import (
    Alert,
    Centroid,
    EnsembleMemberType,
    LayerName,
    WATER_DISCHARGE_ATTRIBUTE,
    WaterDischargeTimeSeriesEntry,
)

ENTRY_START = "start"
ENTRY_END = "end"
LOW = "low"
MEDIAN = "median"
HIGH = "high"


def check_centroid(event_name: str, centroid: Centroid) -> list[str]:
    errors: list[str] = []
    if not (-90 <= centroid.latitude <= 90):
        errors.append(
            f"Alert '{event_name}' centroid: latitude {centroid.latitude} "
            f"out of range [-90, 90]"
        )
    if not (-180 <= centroid.longitude <= 180):
        errors.append(
            f"Alert '{event_name}' centroid: longitude {centroid.longitude} "
            f"out of range [-180, 180]"
        )
    return errors


def check_severity_integrity(event_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []
    if not alert.severity:
        errors.append(f"Alert '{event_name}' has no severity data")
        return errors  # return early since no data

    time_intervals: dict[tuple[str, str], list[EnsembleMemberType]] = {}
    for entry in alert.severity:
        key = (entry.time_interval.start, entry.time_interval.end)
        time_intervals.setdefault(key, []).append(entry.ensemble_member_type)

    for (start, end), types in time_intervals.items():
        if datetime.fromisoformat(start) >= datetime.fromisoformat(end):
            errors.append(
                f"Alert '{event_name}' time interval {start}–{end}: "
                f"start must be before end"
            )
        # TODO: maybe also check that start and end relate to a day for floods and a season for droughts? So generically to the 'temporal unit' defined for a hazard type?
        median_count = types.count(EnsembleMemberType.MEDIAN)
        ensemble_count = types.count(EnsembleMemberType.RUN)
        if median_count != 1:
            errors.append(
                f"Alert '{event_name}' time interval {start}–{end}: "
                f"expected 1 median record, found {median_count}"
            )
        if ensemble_count < 1:
            errors.append(
                f"Alert '{event_name}' time interval {start}–{end}: "
                f"expected at least 1 ensemble-run record, found 0"
            )
    return errors


def check_admin_area_integrity(event_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []

    if not alert.exposure.admin_areas:
        errors.append(f"Alert '{event_name}' admin-area: expected at least 1 record")
        return errors

    levels: dict[int, dict[LayerName, int]] = {}
    for entry in alert.exposure.admin_areas:
        level_layers = levels.setdefault(entry.admin_level, {})
        level_layers[entry.layer] = level_layers.get(entry.layer, 0) + 1

        if isinstance(entry.value, (int, float)) and entry.value < 0:
            errors.append(
                f"Alert '{event_name}' admin-area '{entry.place_code}': "
                f"layer '{entry.layer}' must be non-negative, got {entry.value}"
            )

    admin_area_required = (LayerName.EXPOSED_POPULATION,)
    for level, layer_counts in sorted(levels.items()):
        for required in admin_area_required:
            if required not in layer_counts:
                errors.append(
                    f"Alert '{event_name}' admin-area level {level}: "
                    f"missing required layer '{required}'"
                )

        counts = list(layer_counts.values())
        if len(set(counts)) > 1:
            detail = ", ".join(f"{key}={count}" for key, count in layer_counts.items())
            errors.append(
                f"Alert '{event_name}' admin-area level {level}: "
                f"record count differs across layers ({detail})"
            )

    return errors


def check_raster_integrity(event_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []
    for raster in alert.exposure.rasters:
        ext = raster.extent
        if ext.xmin >= ext.xmax or ext.ymin >= ext.ymax:
            errors.append(
                f"Alert '{event_name}' raster '{raster.layer}': "
                f"invalid extent (xmin={ext.xmin}, ymin={ext.ymin}, "
                f"xmax={ext.xmax}, ymax={ext.ymax})"
            )
        if not raster.value_greyscale:
            errors.append(
                f"Alert '{event_name}' raster '{raster.layer}': "
                f"value_greyscale is empty"
            )
        else:
            try:
                decoded = base64.b64decode(raster.value_greyscale, validate=True)
            except (ValueError, binascii.Error):
                errors.append(
                    f"Alert '{event_name}' raster '{raster.layer}': "
                    f"value_greyscale is not valid base64"
                )
            else:
                # Look at the first few bytes to verify it is a b/w png
                png_signature = b"\x89PNG\r\n\x1a\n"
                if not decoded.startswith(png_signature):
                    errors.append(
                        f"Alert '{event_name}' raster '{raster.layer}': "
                        f"value_greyscale is not a valid PNG"
                    )
    return errors


def check_geo_feature_integrity(event_name: str, alert: Alert) -> list[str]:
    # TODO: only validates the 'waterDischarge' attribute key; extend to other keys.
    errors: list[str] = []
    for geo_feature in alert.exposure.geo_features:
        water_discharge = geo_feature.attributes.get(WATER_DISCHARGE_ATTRIBUTE)
        if water_discharge is None:
            continue
        error_prefix = (
            f"Alert '{event_name}' geo-feature '{geo_feature.geo_feature_id}': "
            f"{WATER_DISCHARGE_ATTRIBUTE}"
        )
        if not isinstance(water_discharge, list):
            errors.append(f"{error_prefix} must be a list of time series entries")
            continue
        if not water_discharge:
            errors.append(f"{error_prefix} has no time series entries")
            continue
        for entry in water_discharge:
            errors.extend(_check_water_discharge_entry(error_prefix, entry))
    return errors


START = "start"
END = "end"
LOW = "low"
MEDIAN = "median"
HIGH = "high"


def _check_water_discharge_entry(prefix: str, entry: object) -> list[str]:
    if not isinstance(entry, dict):
        return [f"{prefix} entry must be an object"]
    missing_keys = sorted(
        WaterDischargeTimeSeriesEntry.__required_keys__ - entry.keys()
    )
    if missing_keys:
        return [f"{prefix} entry is missing keys: {', '.join(missing_keys)}"]
    start, end = entry[START], entry[END]
    try:
        start_at = datetime.fromisoformat(start)
        end_at = datetime.fromisoformat(end)
    except (TypeError, ValueError):
        return [
            (
                f"{prefix} time interval {start}\u2013{end}: "
                "start/end must be ISO 8601 timestamps"
            )
        ]
    errors: list[str] = []
    if start_at >= end_at:
        errors.append(
            f"{prefix} time interval {start}\u2013{end}: start must be before end"
        )
    values = [entry[LOW], entry[MEDIAN], entry[HIGH]]
    if not all(
        isinstance(value, (int, float)) and not isinstance(value, bool)
        for value in values
    ):
        errors.append(
            f"{prefix} time interval {start}\u2013{end}: "
            f"low/median/high must be numeric"
        )
    elif entry[LOW] > entry[MEDIAN] or entry[MEDIAN] > entry[HIGH]:
        errors.append(
            f"{prefix} time interval {start}\u2013{end}: expected low <= median <= high"
        )
    elif entry[LOW] < 0:
        errors.append(
            f"{prefix} time interval {start}\u2013{end}: "
            f"discharge values must be non-negative"
        )
    return errors
