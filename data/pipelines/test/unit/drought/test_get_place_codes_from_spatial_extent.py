from pipelines.drought.forecast import _get_place_codes_from_spatial_extent
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.infra.data_types.loaded_data_types import AlertConfig


def _make_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_areas={
            "ET00": AdminArea(
                properties=AdminAreaProperties(
                    pcode="ET00",
                    name="Ethiopia",
                    admin_level=0,
                    country_code="ETH",
                ),
                geometry_type="MultiPolygon",
                coordinates=[],
            ),
            "ET01": AdminArea(
                properties=AdminAreaProperties(
                    pcode="ET01",
                    name="Oromia",
                    admin_level=1,
                    country_code="ETH",
                    parent_pcode="ET00",
                ),
                geometry_type="MultiPolygon",
                coordinates=[],
            ),
            "ET0101": AdminArea(
                properties=AdminAreaProperties(
                    pcode="ET0101",
                    name="West Shewa",
                    admin_level=2,
                    country_code="ETH",
                    parent_pcode="ET01",
                ),
                geometry_type="MultiPolygon",
                coordinates=[],
            ),
            "ET0102": AdminArea(
                properties=AdminAreaProperties(
                    pcode="ET0102",
                    name="East Shewa",
                    admin_level=2,
                    country_code="ETH",
                    parent_pcode="ET01",
                ),
                geometry_type="MultiPolygon",
                coordinates=[],
            ),
        }
    )


def test_returns_explicit_place_codes_when_provided():
    config = AlertConfig(
        spatial_extent_name="Belg",
        spatial_extent_place_codes=["ET0101", "ET0102"],
        temporal_extents=[],
    )
    result = _get_place_codes_from_spatial_extent(config, _make_admin_areas(), 2)
    assert result == ["ET0101", "ET0102"]


def test_expands_to_all_admin_areas_at_target_level_when_empty():
    config = AlertConfig(
        spatial_extent_name="National",
        spatial_extent_place_codes=[],
        temporal_extents=[],
    )
    result = _get_place_codes_from_spatial_extent(config, _make_admin_areas(), 2)
    assert sorted(result) == ["ET0101", "ET0102"]


def test_expands_to_different_admin_level():
    config = AlertConfig(
        spatial_extent_name="National",
        spatial_extent_place_codes=[],
        temporal_extents=[],
    )
    result = _get_place_codes_from_spatial_extent(config, _make_admin_areas(), 1)
    assert result == ["ET01"]


def test_returns_empty_when_no_areas_match_level():
    config = AlertConfig(
        spatial_extent_name="National",
        spatial_extent_place_codes=[],
        temporal_extents=[],
    )
    result = _get_place_codes_from_spatial_extent(config, _make_admin_areas(), 3)
    assert result == []
