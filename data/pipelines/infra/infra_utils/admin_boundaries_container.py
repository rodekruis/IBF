from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class GeoJsonFeatureProperties:
    pcode: str
    name: str
    adm0_pcode: str | None = None
    parent_pcodes: dict[int, str] = field(default_factory=dict)


@dataclass
class GeoJsonFeature:
    properties: GeoJsonFeatureProperties
    geometry_type: str
    coordinates: list


@dataclass
class AdminBoundariesContainer:
    admin_level: int
    features: dict[str, GeoJsonFeature]

    @staticmethod
    def from_geojson(admin_level: int, raw: dict) -> AdminBoundariesContainer:
        features = {}

        for f in raw.get("features", []):
            props = f.get("properties", {})
            pcode = props.get(f"ADM{admin_level}_PCODE", "")
            feature_name = props.get(f"ADM{admin_level}_EN", "")
            adm0_pcode = props.get("ADM0_PCODE")

            parent_pcodes = {}
            for level in range(1, admin_level):
                parent_pcode = props.get(f"ADM{level}_PCODE")
                if parent_pcode:
                    parent_pcodes[level] = parent_pcode

            geom = f.get("geometry", {})

            features[pcode] = GeoJsonFeature(
                properties=GeoJsonFeatureProperties(
                    pcode=pcode,
                    name=feature_name,
                    adm0_pcode=adm0_pcode,
                    parent_pcodes=parent_pcodes,
                ),
                geometry_type=geom.get("type", ""),
                coordinates=geom.get("coordinates", []),
            )

        return AdminBoundariesContainer(
            admin_level=admin_level,
            features=features,
        )
