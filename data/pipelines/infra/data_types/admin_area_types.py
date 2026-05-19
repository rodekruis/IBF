"""
Data structure for holding admin area data
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AdminAreaProperties:
    """
    The code and name (in English) of an admin area, its admin level, its country code,
    and a dict of all parent place codes keyed by admin level.
    Adm0 has no parents; Adm3 would have parents at levels 0, 1, and 2.
    """

    pcode: str
    name: str
    admin_level: int
    country_code: str
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
    # Admin areas are keyed on admin area code, at the target admin level only
    admin_areas: dict[str, AdminArea]

    def __bool__(self) -> bool:
        return bool(self.admin_areas)

    @staticmethod
    def from_api(feature_collection: dict) -> AdminAreasSet:
        admin_areas: dict[str, AdminArea] = {}

        for feature in feature_collection.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry") or {}
            attributes = props.get("attributes") or {}

            parent_pcodes: dict[int, str] = {}
            if isinstance(attributes, dict):
                for key, value in attributes.items():
                    if key.startswith("ADM") and key.endswith("_PCODE") and value:
                        try:
                            level = int(key[3:-6])
                        except ValueError:
                            continue
                        parent_pcodes[level] = str(value)

            pcode = props.get("placeCode", "")
            admin_areas[pcode] = AdminArea(
                properties=AdminAreaProperties(
                    pcode=pcode,
                    name=props.get("nameEn", ""),
                    admin_level=props.get("adminLevel", 0),
                    country_code=props.get("countryCodeIso3", ""),
                    parent_pcodes=parent_pcodes,
                ),
                geometry_type=geom.get("type", ""),
                coordinates=geom.get("coordinates", []),
            )

        return AdminAreasSet(admin_areas=admin_areas)
