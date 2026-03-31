from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pipelines.infra.alert_admin_aggregation import aggregate_to_parent_admin_levels
from pipelines.infra.alert_types import (
    AdminAreaExposure,
    Alert,
    Centroid,
    Exposure,
    ForecastSource,
    HazardType,
    Layer,
)
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)


def _mock_admin_area(pcode: str, parent_pcodes: dict[int, str]) -> AdminArea:
    return AdminArea(
        properties=AdminAreaProperties(
            pcode=pcode,
            name=f"mock_name_for_{pcode}",
            parent_pcodes=parent_pcodes,
        ),
        geometry_type="",
        coordinates=[],
    )


MOCK_ADMIN_AREAS_LEVEL_3: AdminAreasSet = AdminAreasSet(
    admin_level=3,
    admin_areas={
        "child-A": _mock_admin_area("child-A", {2: "parent-X", 1: "top"}),
        "child-B": _mock_admin_area("child-B", {2: "parent-X", 1: "top"}),
        "child-C": _mock_admin_area("child-C", {2: "parent-Y", 1: "top"}),
    },
)

MOCK_ADMIN_AREAS_LEVEL_2: AdminAreasSet = AdminAreasSet(
    admin_level=2,
    admin_areas={
        "child-A": _mock_admin_area("child-A", {1: "top"}),
        "child-B": _mock_admin_area("child-B", {1: "top"}),
    },
)


def _make_alert(entries: list[AdminAreaExposure]) -> Alert:
    return Alert(
        alert_name="test-alert",
        issued_at=datetime.now(timezone.utc),
        centroid=Centroid(latitude=0.0, longitude=0.0),
        hazard_types=[HazardType.FLOODS],
        forecast_sources=[ForecastSource.GLOFAS],
        exposure=Exposure(admin_area=entries),
    )


def _entries_at_level(alert: Alert, level: int) -> list[AdminAreaExposure]:
    return [e for e in alert.exposure.admin_area if e.admin_level == level]


def test_boolean_aggregation_uses_any():
    # Parent is True if any child is True, False if all children are False
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 3, Layer.SPATIAL_EXTENT, True),
            AdminAreaExposure("child-B", 3, Layer.SPATIAL_EXTENT, False),
            AdminAreaExposure("child-C", 3, Layer.SPATIAL_EXTENT, False),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)

    level_2 = _entries_at_level(alert, 2)
    parent_x = [e for e in level_2 if e.place_code == "parent-X"]
    parent_y = [e for e in level_2 if e.place_code == "parent-Y"]

    assert len(parent_x) == 1
    assert parent_x[0].value is True

    assert len(parent_y) == 1
    assert parent_y[0].value is False


def test_numeric_aggregation_uses_sum():
    # Parent population = sum of children (100 + 250 = 350 for parent-X, 50 for parent-Y)
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 3, Layer.POPULATION_EXPOSED, 100),
            AdminAreaExposure("child-B", 3, Layer.POPULATION_EXPOSED, 250),
            AdminAreaExposure("child-C", 3, Layer.POPULATION_EXPOSED, 50),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)

    level_2 = _entries_at_level(alert, 2)
    parent_x = [e for e in level_2 if e.place_code == "parent-X"]
    parent_y = [e for e in level_2 if e.place_code == "parent-Y"]

    assert parent_x[0].value == 350
    assert parent_y[0].value == 50


def test_aggregation_produces_all_levels():
    # 3-level areas should produce entries at levels 3, 2, and 1
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 3, Layer.SPATIAL_EXTENT, True),
            AdminAreaExposure("child-B", 3, Layer.SPATIAL_EXTENT, True),
            AdminAreaExposure("child-C", 3, Layer.SPATIAL_EXTENT, False),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)

    levels = {e.admin_level for e in alert.exposure.admin_area}
    assert levels == {1, 2, 3}

    level_1 = _entries_at_level(alert, 1)
    assert len(level_1) == 1
    assert level_1[0].place_code == "top"
    assert level_1[0].value is True


def test_grandparent_sums_from_deepest_not_from_parents():
    # Level 1 sums all deepest entries directly (100+200+50=350), not parent subtotals
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 3, Layer.POPULATION_EXPOSED, 100),
            AdminAreaExposure("child-B", 3, Layer.POPULATION_EXPOSED, 200),
            AdminAreaExposure("child-C", 3, Layer.POPULATION_EXPOSED, 50),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)

    level_1 = _entries_at_level(alert, 1)
    assert level_1[0].value == 350


def test_two_level_hierarchy():
    # Works with only 2 admin levels (no grandparent pass)
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 2, Layer.POPULATION_EXPOSED, 10),
            AdminAreaExposure("child-B", 2, Layer.POPULATION_EXPOSED, 20),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_2)

    level_1 = _entries_at_level(alert, 1)
    assert len(level_1) == 1
    assert level_1[0].place_code == "top"
    assert level_1[0].value == 30


def test_empty_alert_is_noop():
    # No entries in, no entries out
    alert = _make_alert([])
    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)
    assert alert.exposure.admin_area == []


def test_unknown_place_code_is_skipped():
    # Place codes not in admin_areas are silently ignored
    alert = _make_alert(
        [
            AdminAreaExposure("unknown", 3, Layer.SPATIAL_EXTENT, True),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)

    assert len(alert.exposure.admin_area) == 1


def test_multiple_layers_aggregated_independently():
    # spatial_extent and population_exposed are aggregated separately per parent
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 3, Layer.SPATIAL_EXTENT, True),
            AdminAreaExposure("child-A", 3, Layer.POPULATION_EXPOSED, 100),
            AdminAreaExposure("child-B", 3, Layer.SPATIAL_EXTENT, False),
            AdminAreaExposure("child-B", 3, Layer.POPULATION_EXPOSED, 200),
        ]
    )

    aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)

    level_2 = _entries_at_level(alert, 2)
    spatial = [e for e in level_2 if e.layer == Layer.SPATIAL_EXTENT]
    population = [e for e in level_2 if e.layer == Layer.POPULATION_EXPOSED]

    assert len(spatial) == 1
    assert spatial[0].value is True
    assert len(population) == 1
    assert population[0].value == 300


def test_mixed_value_types_raises():
    # Mixing bool and int for the same layer should raise ValueError
    alert = _make_alert(
        [
            AdminAreaExposure("child-A", 3, Layer.SPATIAL_EXTENT, True),
            AdminAreaExposure("child-B", 3, Layer.SPATIAL_EXTENT, 42),
        ]
    )

    with pytest.raises(ValueError, match="Mixed or unsupported"):
        aggregate_to_parent_admin_levels(alert, MOCK_ADMIN_AREAS_LEVEL_3)
