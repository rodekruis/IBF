from __future__ import annotations

from typing import Callable

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.dtos import (
    Centroid,
    EnsembleMemberType,
    HazardType,
    LayerName,
    SeverityKey,
)
from pipelines.infra.utils.raster import PLACEHOLDER_RASTER_BASE64

HazardFunction = Callable[[DataProvider, DataSubmitter, str, int], None]


def make_infra_mock_hazard_function(
    alert_count: int, hazard_type: HazardType
) -> HazardFunction:
    """Build a hazard function that bypasses forecast.py and generates
    ``alert_count`` alerts. Used by ``--infra-only`` to test pipeline infra
    without any hazard logic. ``alert_count`` 0 returns void for no-alert."""

    def _infra_mock_hazard_fn(
        data_provider: DataProvider,
        data_submitter: DataSubmitter,
        country: str,
        target_admin_level: int,
    ) -> None:
        if alert_count <= 0:
            return

        _generate_mock_alerts(
            data_provider,
            data_submitter,
            country,
            target_admin_level,
            hazard_type,
            alert_count,
        )

    return _infra_mock_hazard_fn


def _generate_mock_alerts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
    hazard_type: HazardType,
    alert_count: int,
) -> None:
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )
    if not target_admin_areas:
        data_submitter.add_error("Missing admin area data for mock alert")
        return

    place_codes = list(target_admin_areas.admin_areas.keys())

    for i in range(alert_count):
        event_name = f"{country}_{hazard_type}_mock-alert-{i + 1}"
        exposed_pcodes = place_codes[i * 2 : (i + 1) * 2] or place_codes[:2]

        data_submitter.create_alert(
            event_name=event_name,
            centroid=Centroid(latitude=float(i), longitude=float(i)),
        )

        severity_value = 300 + i * 200
        for _ in range(2):
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start="2026-01-01T00:00:00Z",
                time_interval_end="2026-01-01T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.RUN,
                severity_key=SeverityKey.RETURN_PERIOD,
                severity_value=severity_value,
            )
        data_submitter.add_severity_data(
            event_name=event_name,
            time_interval_start="2026-01-01T00:00:00Z",
            time_interval_end="2026-01-01T23:59:59Z",
            ensemble_member_type=EnsembleMemberType.MEDIAN,
            severity_key=SeverityKey.RETURN_PERIOD,
            severity_value=severity_value,
        )

        data_submitter.add_admin_area_exposure(
            event_name=event_name,
            admin_level=target_admin_level,
            layer=LayerName.POPULATION_EXPOSED,
            values_by_place_code={
                place_code: 50 * (i + 1) for place_code in exposed_pcodes
            },
        )

        data_submitter.add_raster_exposure(
            event_name=event_name,
            layer=LayerName.FLOOD_DEPTH,
            value_black_white=PLACEHOLDER_RASTER_BASE64,
            extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
        )
