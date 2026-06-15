from __future__ import annotations

import base64
import re
from datetime import datetime

from pipelines.infra.data_types.dtos import (
    Alert,
    Centroid,
    EnsembleMemberType,
    HazardType,
    Layer,
)

# This enforces that alert event names follow the pattern "{countryCodeISO3}_{hazardType}_{identifier}", where the latter can consist of any number of parts
# Keep in line with definition in alerts.service.ts
EVENT_NAME_PATTERN = re.compile(
    r"^[A-Z]{3}_(" + "|".join(re.escape(h.value) for h in HazardType) + r")_.+$"
)


def check_event_name_format(event_name: str) -> list[str]:
    if not EVENT_NAME_PATTERN.match(event_name):
        return [
            f"Alert '{event_name}' does not match expected format "
            f"'{{COUNTRY}}_{{hazardType}}_{{identifier}}'"
        ]
    return []


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

    levels: dict[int, dict[Layer, int]] = {}
    for entry in alert.exposure.admin_areas:
        level_layers = levels.setdefault(entry.admin_level, {})
        level_layers[entry.layer] = level_layers.get(entry.layer, 0) + 1

        if isinstance(entry.value, (int, float)) and entry.value < 0:
            errors.append(
                f"Alert '{event_name}' admin-area '{entry.place_code}': "
                f"layer '{entry.layer}' must be non-negative, got {entry.value}"
            )

    admin_area_required = (Layer.POPULATION_EXPOSED,)
    for level, layer_counts in sorted(levels.items()):
        for required in admin_area_required:
            if required not in layer_counts:
                errors.append(
                    f"Alert '{event_name}' admin-area level {level}: "
                    f"missing required layer '{required}'"
                )

        counts = list(layer_counts.values())
        if len(set(counts)) > 1:
            detail = ", ".join(
                f"{layer}={count}" for layer, count in layer_counts.items()
            )
            errors.append(
                f"Alert '{event_name}' admin-area level {level}: "
                f"record count differs across layers ({detail})"
            )

    return errors


def check_raster_integrity(event_name: str, alert: Alert) -> list[str]:
    errors: list[str] = []
    raster_layers = {r.layer for r in alert.exposure.rasters}
    if Layer.ALERT_EXTENT not in raster_layers:
        errors.append(
            f"Alert '{event_name}' rasters: missing required 'alert_extent' layer"
        )
    for raster in alert.exposure.rasters:
        ext = raster.extent
        if ext.xmin >= ext.xmax or ext.ymin >= ext.ymax:
            errors.append(
                f"Alert '{event_name}' raster '{raster.layer}': "
                f"invalid extent (xmin={ext.xmin}, ymin={ext.ymin}, "
                f"xmax={ext.xmax}, ymax={ext.ymax})"
            )
        if not raster.value_black_white:
            errors.append(
                f"Alert '{event_name}' raster '{raster.layer}': "
                f"value_black_white is empty"
            )
        else:
            try:
                decoded = base64.b64decode(raster.value_black_white, validate=True)
            except Exception:
                errors.append(
                    f"Alert '{event_name}' raster '{raster.layer}': "
                    f"value_black_white is not valid base64"
                )
            else:
                # Look at the first few bytes to verify it is a b/w png
                png_signature = b"\x89PNG\r\n\x1a\n"
                if not decoded.startswith(png_signature):
                    errors.append(
                        f"Alert '{event_name}' raster '{raster.layer}': "
                        f"value_black_white is not a valid PNG"
                    )
    return errors
