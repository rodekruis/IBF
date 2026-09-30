from __future__ import annotations

from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.dtos import Alert, Centroid
from shapely.ops import unary_union


def compute_alert_centroid(
    alert: Alert,
    admin_areas: AdminAreasSet,
) -> Centroid | None:
    """Center of mass of the deepest-level exposed admin areas of the alert.

    The center of mass is the area-weighted centroid of the union of the exposed
    admin-area geometries at the deepest admin level. Returns None when no exposed
    admin-area geometry is available, which is rejected by check_centroid later.
    """
    admin_area_entries = alert.exposure.admin_areas
    if not admin_area_entries:
        return None

    deepest_level = max(entry.admin_level for entry in admin_area_entries)

    exposed_place_codes = {
        entry.place_code
        for entry in admin_area_entries
        if entry.admin_level == deepest_level
    }

    geometries = [
        admin_areas.admin_areas[place_code].to_geometry()
        for place_code in exposed_place_codes
        if place_code in admin_areas.admin_areas
    ]
    if not geometries:
        return None

    center_of_mass = unary_union(geometries).centroid
    if center_of_mass.is_empty:
        return None

    return Centroid(latitude=center_of_mass.y, longitude=center_of_mass.x)
