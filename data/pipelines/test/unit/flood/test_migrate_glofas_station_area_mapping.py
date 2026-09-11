import json

from data_management.seed_data_management.flood.migrate_glofas_station_area_mapping import (
    migrate_country,
)


def create_feature(pcode: str, coordinates: list) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [coordinates]},
        "properties": {"ADM3_PCODE": pcode},
    }


def write_admin_features(root, country: str, features: list[dict]) -> None:
    filepath = root / "admin-areas" / "processed" / f"{country}_adm3.json"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )


def test_migrate_country_maps_new_areas_by_old_footprint(tmp_path):
    old_root = tmp_path / "old"
    new_root = tmp_path / "new"
    output_root = tmp_path / "output"
    old_features = [create_feature("OLD", [(0, 0), (2, 0), (2, 2), (0, 2), (0, 0)])]
    new_features = [
        create_feature("NEW_LEFT", [(0, 0), (1, 0), (1, 2), (0, 2), (0, 0)]),
        create_feature("NEW_RIGHT", [(1, 0), (2, 0), (2, 2), (1, 2), (1, 0)]),
        create_feature("OUTSIDE", [(3, 0), (4, 0), (4, 1), (3, 1), (3, 0)]),
    ]
    write_admin_features(old_root, "MWI", old_features)
    write_admin_features(new_root, "MWI", new_features)
    station_directory = old_root / "hazard" / "flood" / "glofas-stations"
    station_directory.mkdir(parents=True)
    (station_directory / "MWI_station_thresholds.json").write_text(
        json.dumps(
            [
                {
                    "station_code": "G1",
                    "pcodes": {"3": ["OLD"]},
                    "thresholds": [],
                }
            ]
        ),
        encoding="utf-8",
    )

    report = migrate_country(old_root, new_root, output_root, "MWI", 0.25, 0.9)

    assert report[0]["new_pcodes"] == ["NEW_LEFT", "NEW_RIGHT"]
