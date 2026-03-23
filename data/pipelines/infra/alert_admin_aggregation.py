from __future__ import annotations

from pipelines.infra.alert_types import AdminAreaExposure, AdminAreaLayer, Alert


def aggregate_to_parent_admin_levels(
    alert: Alert,
    admin_boundaries: dict[str, dict[str, object]],
) -> None:
    """Aggregate admin area exposure from the deepest admin level upward.

    Starting from the deepest level present in the alert, this iteratively
    builds parent-level values by grouping child entries by their parent
    place code and aggregating per layer:
    - Boolean layers (e.g. spatial_extent): aggregated via ``any()`` — a
      parent is True if any of its children is True.
    - Numeric layers (e.g. population_exposed): aggregated via ``sum()``,
      which is correct for absolute counts.

    Note: percentage or rate-based layers are not yet supported. These would
    require a weighted average (e.g. weighted by child population). When such
    layers are added, extend the aggregation logic here.

    Entries whose place code or parent place code is missing from
    admin_boundaries are silently skipped. Downstream integrity checks
    (alert_integrity_checks) will catch incomplete results.

    The aggregated entries are appended directly to ``alert.exposure.admin_area``.
    """
    current_entries = list(alert.exposure.admin_area)
    if not current_entries:
        return

    # Walk upward one level at a time, from deepest to shallowest
    while True:
        current_level = max(entry.admin_level for entry in current_entries)

        entries_at_level = [
            entry for entry in current_entries if entry.admin_level == current_level
        ]

        # Group child values by (parent_place_code, parent_level, layer)
        parent_aggregated: dict[
            tuple[str, int, AdminAreaLayer], list[bool | int | float]
        ] = {}

        for entry in entries_at_level:
            boundary = admin_boundaries.get(entry.place_code)
            if boundary is None:
                # Child place code not found in boundaries — skip silently
                continue

            parent_code = boundary.get("parent_place_code")
            if parent_code is None:
                # Top-level area reached (no parent) — skip
                continue

            parent_boundary = admin_boundaries.get(str(parent_code))
            if parent_boundary is None:
                # Parent place code not in boundaries — skip silently
                continue

            parent_level = int(parent_boundary["admin_level"])
            key = (str(parent_code), parent_level, entry.layer)
            parent_aggregated.setdefault(key, []).append(entry.value)

        if not parent_aggregated:
            break

        # Aggregate grouped child values into parent entries
        new_entries: list[AdminAreaExposure] = []
        for (
            place_code,
            admin_level,
            layer,
        ), values in parent_aggregated.items():
            if all(isinstance(v, bool) for v in values):
                # Boolean: parent is True if any child is True
                aggregated_value: bool | int | float = any(values)
            else:
                # Numeric (absolute counts): sum children
                # TODO: add weighted average for percentage/rate layers
                aggregated_value = sum(v for v in values if not isinstance(v, bool))

            new_entry = AdminAreaExposure(
                place_code=place_code,
                admin_level=admin_level,
                layer=layer,
                value=aggregated_value,
            )
            alert.exposure.admin_area.append(new_entry)
            new_entries.append(new_entry)

        # Use the newly created parent entries as input for the next iteration
        current_entries = new_entries
