"""
Data structure for holding admin area data
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AdminAreaProperties:
    """
    The code and name (in English) of an admin area, along with a list of all parent codes.
    Adm0 would have no parents, while Adm4 would have 4 parents.
    """

    pcode: str
    name: str
    adm0_pcode: str | None = None
    parent_pcodes: dict[int, str] = field(default_factory=dict)


@dataclass
class AdminArea:
    """
    This represents a single admin area, with coordinates being a list of points for the area
    """

    properties: AdminAreaProperties
    geometry_type: str
    coordinates: list


@dataclass
class AdminAreasSet:
    admin_level: int
    # Admin areas are keyed on admin area code
    admin_areas: dict[str, AdminArea]

    @staticmethod
    def from_geojson(admin_level: int, raw: dict) -> AdminAreasSet:
        admin_areas = {}

        for f in raw.get("features", []):
            props = f.get("properties", {})
            pcode = props.get(f"ADM{admin_level}_PCODE", "")
            feature_name = props.get(f"ADM{admin_level}_EN", "")
            adm0_pcode = props.get("ADM0_PCODE")

            parent_pcodes = {}
            for level in range(0, admin_level):
                parent_pcode = props.get(f"ADM{level}_PCODE")
                if parent_pcode:
                    parent_pcodes[level] = parent_pcode

            geom = f.get("geometry", {})

            admin_areas[pcode] = AdminArea(
                properties=AdminAreaProperties(
                    pcode=pcode,
                    name=feature_name,
                    adm0_pcode=adm0_pcode,
                    parent_pcodes=parent_pcodes,
                ),
                geometry_type=geom.get("type", ""),
                coordinates=geom.get("coordinates", []),
            )

        return AdminAreasSet(
            admin_level=admin_level,
            admin_areas=admin_areas,
        )
