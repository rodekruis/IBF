from __future__ import annotations

from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.infra.data_types.dtos import (
    Alert,
    Exposure,
    ExposureAdminArea,
    LayerName,
)
from pipelines.infra.utils.alert_centroid import compute_alert_centroid


def _square_admin_area(pcode: str, min_lon: float, min_lat: float) -> AdminArea:
    return AdminArea(
        properties=AdminAreaProperties(
            pcode=pcode, name=pcode, admin_level=2, country_code="MOC"
        ),
        geometry_type="Polygon",
        coordinates=[
            [
                [min_lon, min_lat],
                [min_lon, min_lat + 1.0],
                [min_lon + 1.0, min_lat + 1.0],
                [min_lon + 1.0, min_lat],
                [min_lon, min_lat],
            ]
        ],
    )


def _make_alert(admin_areas: list[ExposureAdminArea]) -> Alert:
    return Alert(
        event_name="test-alert",
        exposure=Exposure(admin_areas=admin_areas),
    )


def test_returns_none_when_there_is_no_admin_area_exposure():
    # Arrange
    alert = _make_alert([])

    # Act
    centroid = compute_alert_centroid(alert, AdminAreasSet(admin_areas={}))

    # Assert
    assert centroid is None


def test_returns_none_when_no_exposed_place_code_has_geometry():
    # Arrange
    alert = _make_alert(
        [ExposureAdminArea("missing", 2, LayerName.EXPOSED_POPULATION, 100)]
    )

    # Act
    centroid = compute_alert_centroid(alert, AdminAreasSet(admin_areas={}))

    # Assert
    assert centroid is None


def test_single_admin_area_centroid_is_its_center():
    # Arrange
    admin_areas = AdminAreasSet(
        admin_areas={"PC001": _square_admin_area("PC001", 0.0, 0.0)}
    )
    alert = _make_alert(
        [ExposureAdminArea("PC001", 2, LayerName.EXPOSED_POPULATION, 100)]
    )

    # Act
    centroid = compute_alert_centroid(alert, admin_areas)

    # Assert
    assert centroid is not None
    assert centroid.longitude == 0.5
    assert centroid.latitude == 0.5


def test_center_of_mass_of_two_admin_areas():
    # Arrange
    admin_areas = AdminAreasSet(
        admin_areas={
            "PC001": _square_admin_area("PC001", 0.0, 0.0),
            "PC002": _square_admin_area("PC002", 2.0, 0.0),
        }
    )
    alert = _make_alert(
        [
            ExposureAdminArea("PC001", 2, LayerName.EXPOSED_POPULATION, 100),
            ExposureAdminArea("PC002", 2, LayerName.EXPOSED_POPULATION, 100),
        ]
    )

    # Act
    centroid = compute_alert_centroid(alert, admin_areas)

    # Assert
    assert centroid is not None
    assert centroid.longitude == 1.5
    assert centroid.latitude == 0.5


def test_uses_only_the_deepest_admin_level():
    # Arrange
    admin_areas = AdminAreasSet(
        admin_areas={
            "child": _square_admin_area("child", 0.0, 0.0),
            "parent": _square_admin_area("parent", 10.0, 10.0),
        }
    )
    child_entry = ExposureAdminArea("child", 3, LayerName.EXPOSED_POPULATION, 100)
    parent_entry = ExposureAdminArea("parent", 2, LayerName.EXPOSED_POPULATION, 100)
    alert = _make_alert([child_entry, parent_entry])

    # Act
    centroid = compute_alert_centroid(alert, admin_areas)

    # Assert
    assert centroid is not None
    assert centroid.longitude == 0.5
    assert centroid.latitude == 0.5
