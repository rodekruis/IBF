from __future__ import annotations

from pipelines.infra.alert_types import AdminAreaExposure, Alert, Layer

# Ancestor fields on each boundary entry, in order from nearest to farthest.
# TODO: when we are sure we can deduce parent place codes from child place codes via place code format, we can simplify this behaviour.
ANCESTOR_FIELDS = [
    "parent_place_code",
    "grandparent_place_code",
    "great_grandparent_place_code",
]


def aggregate_to_parent_admin_levels(
    alert: Alert,
    admin_boundaries: dict[str, dict[str, object]],
) -> None:
    """Aggregate admin area exposure from the deepest admin level upward.

    Each pass groups the deepest-level entries by an ancestor field
    and aggregates per layer:
    - Boolean layers (e.g. spatial_extent): aggregated via ``any()`` — a
      parent is True if any of its children is True.
    - Numeric layers (e.g. population_exposed): aggregated via ``sum()``,
      which is correct for absolute counts.

    Note: percentage or rate-based layers are not yet supported. These would
    require a weighted average (e.g. weighted by child population). When such
    layers are added, extend the aggregation logic here.

    Only deepest-level boundary entries are expected in admin_boundaries.
    Entries whose place code is not in admin_boundaries or whose ancestor
    field is missing/None are silently skipped. Downstream integrity checks
    (alert_integrity_checks) will catch incomplete results.

    The aggregated entries are appended directly to ``alert.exposure.admin_area``.
    """
    deepest_entries = list(alert.exposure.admin_area)
    if not deepest_entries:
        return

    deepest_level = max(entry.admin_level for entry in deepest_entries)

    # One pass per ancestor level: parent (level - 1), grandparent (level - 2), …
    for level_offset, ancestor_field in enumerate(ANCESTOR_FIELDS, start=1):
        target_level = deepest_level - level_offset
        if target_level < 1:
            break

        # Group deepest-level values by (ancestor_place_code, layer)
        grouped: dict[tuple[str, Layer], list[bool | int | float]] = {}

        for entry in deepest_entries:
            boundary = admin_boundaries.get(entry.place_code)
            if boundary is None:
                continue

            ancestor_code = boundary.get(ancestor_field)
            if ancestor_code is None:
                continue

            key = (str(ancestor_code), entry.layer)
            grouped.setdefault(key, []).append(entry.value)

        for (place_code, layer), values in grouped.items():
            if all(isinstance(v, bool) for v in values):
                # Boolean: parent is True if any child is True
                aggregated_value: bool | int | float = any(values)
            elif all(
                isinstance(v, (int, float)) and not isinstance(v, bool) for v in values
            ):
                # Numeric (absolute counts): sum children
                # TODO: add weighted average for percentage/rate layers
                aggregated_value = sum(values)
            else:
                raise ValueError(
                    f"Mixed or unsupported value types for layer {layer} at "
                    f"place_code={place_code}, admin_level={target_level}: {values}"
                )

            alert.exposure.admin_area.append(
                AdminAreaExposure(
                    place_code=place_code,
                    admin_level=target_level,
                    layer=layer,
                    value=aggregated_value,
                )
            )
