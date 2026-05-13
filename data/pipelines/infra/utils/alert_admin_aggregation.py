from __future__ import annotations

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import Alert, ExposureAdminArea, Layer


def aggregate_to_parent_admin_levels(
    alert: Alert,
    admin_areas: AdminAreasSet,
) -> None:
    """Aggregate admin area exposure from the deepest admin level upward.

    Each pass groups values by their parent at the next level up, taking one
    ``parent_pcode`` lookup per group key rather than re-walking the full
    ancestor chain from the deepest level on every iteration.

    Aggregation rules per layer:
    - Boolean layers: ``any()`` — True if any descendant is True.
    - Numeric layers (e.g. population_exposed): ``sum()``,
      which is correct for absolute counts.

    Note: percentage or rate-based layers are not yet supported. These would
    require a weighted average (e.g. weighted by child population). When such
    layers are added, extend the aggregation logic here.

    Entries whose place code is not in admin_areas or whose parent_pcode is
    None are silently skipped. Downstream integrity checks
    (alert_integrity_checks) will catch incomplete results.

    The aggregated entries are appended directly to ``alert.exposure.admin_areas``.
    """
    deepest_entries = list(alert.exposure.admin_areas)
    if not deepest_entries:
        return

    deepest_level = max(entry.admin_level for entry in deepest_entries)

    # Group deepest values by (pcode, layer) — the starting "current" level
    current: dict[tuple[str, Layer], list[bool | int | float]] = {}
    for entry in deepest_entries:
        current.setdefault((entry.place_code, entry.layer), []).append(entry.value)

    # Walk upward one level at a time, carrying accumulated values forward
    for target_level in reversed(range(0, deepest_level)):
        parent: dict[tuple[str, Layer], list[bool | int | float]] = {}

        for (pcode, layer), values in current.items():
            area = admin_areas.admin_areas.get(pcode)
            if area is None or area.properties.parent_pcode is None:
                continue
            parent.setdefault((area.properties.parent_pcode, layer), []).extend(values)

        for (place_code, layer), values in parent.items():
            if all(isinstance(v, bool) for v in values):
                aggregated_value: bool | int | float = any(values)
            elif all(
                isinstance(v, (int, float)) and not isinstance(v, bool) for v in values
            ):
                aggregated_value = sum(values)
            else:
                raise ValueError(
                    f"Mixed or unsupported value types for layer {layer} at "
                    f"place_code={place_code}, admin_level={target_level}: {values}"
                )

            alert.exposure.admin_areas.append(
                ExposureAdminArea(
                    place_code=place_code,
                    admin_level=target_level,
                    layer=layer,
                    value=aggregated_value,
                )
            )

        current = parent
