from data_management.seed_data_management.flood.update_glofas_station_area_mapping import (
    FLOOD_ADMIN_AREA_LEVELS,
    get_station_pcodes,
    load_station_thresholds,
)
from shapely.geometry import Point


def test_flood_admin_area_levels_match_flood_pipeline_configuration():
    assert FLOOD_ADMIN_AREA_LEVELS["MWI"] == [2, 3]
    assert FLOOD_ADMIN_AREA_LEVELS["UGA"] == [2, 3, 4]


def test_load_station_thresholds_deduplicates_station_records(tmp_path):
    filepath = tmp_path / "stations.json"
    filepath.write_text(
        '[{"station_code": "A", "thresholds": []}, '
        '{"station_code": "A", "thresholds": [{"return_period": 1.5}]}]',
        encoding="utf-8",
    )

    result = load_station_thresholds(filepath)

    assert result == [{"station_code": "A", "thresholds": []}]


def test_get_station_pcodes_follows_admin_area_hierarchy():
    admin_areas = {
        0: [
            {
                "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {"ADM0_PCODE": "KE"},
            }
        ],
        1: [
            {
                "geometry": {"type": "Point", "coordinates": [10, 10]},
                "properties": {"ADM0_PCODE": "KE", "ADM1_PCODE": "KE1"},
            }
        ],
    }

    result = get_station_pcodes(
        "KEN",
        [{"station_code": "A", "lat": 0, "lon": 0}],
        [0, 1],
        admin_areas,
        {"A": Point(0, 0)},
    )

    assert result == {"A": {"0": ["KE"], "1": []}}


def test_get_station_pcodes_assigns_an_area_to_one_station():
    admin_areas = {
        0: [
            {
                "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {"ADM0_PCODE": "KE"},
            }
        ],
        1: [
            {
                "geometry": {"type": "Point", "coordinates": [0, 0]},
                "properties": {"ADM0_PCODE": "KE", "ADM1_PCODE": "KE1"},
            }
        ],
    }

    result = get_station_pcodes(
        "KEN",
        [
            {"station_code": "A", "lat": 0, "lon": 0},
            {"station_code": "B", "lat": 10, "lon": 10},
        ],
        [0, 1],
        admin_areas,
        {"A": Point(0, 0), "B": Point(0, 0)},
    )

    assert result == {
        "A": {"0": ["KE"], "1": ["KE1"]},
        "B": {"0": ["KE"], "1": []},
    }
