"""
Data structure for holding admin area data
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AdminAreaProperties:
    """
    The code and name (in English) of an admin area, its admin level, its country code,
    and the code of its immediate parent. Adm0 has no parent; Adm4's parent is its Adm3 area.
    """

    pcode: str
    name: str
    admin_level: int
    country_code: str
    parent_pcode: str | None = None


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
    # Admin areas are keyed on admin area code, spanning all levels 0..target_admin_level
    admin_areas: dict[str, AdminArea]

    def __bool__(self) -> bool:
        return bool(self.admin_areas)

    @staticmethod
    def from_api(rows: list) -> AdminAreasSet:
        admin_areas: dict[str, AdminArea] = {}

        for row in rows:
            pcode = row.get("placeCode", "")
            name = row.get("nameEn", "")
            admin_level = row.get("adminLevel", 0)
            country_code = row.get("countryCodeIso3", "")
            parent_pcode = row.get("parentPlaceCode") or None
            geom = row.get("geometry", {})

            admin_areas[pcode] = AdminArea(
                properties=AdminAreaProperties(
                    pcode=pcode,
                    name=name,
                    admin_level=admin_level,
                    country_code=country_code,
                    parent_pcode=parent_pcode,
                ),
                geometry_type=geom.get("type", ""),
                coordinates=geom.get("coordinates", []),
            )

        return AdminAreasSet(admin_areas=admin_areas)
