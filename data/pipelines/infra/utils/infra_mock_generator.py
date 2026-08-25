from __future__ import annotations

from dataclasses import dataclass
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


@dataclass(frozen=True)
class HazardMockProfile:
    severity_key: SeverityKey
    raster_layer: LayerName | None
    severity_value_base: float
    severity_value_step: float
    ensemble_member_count: int
    time_interval_count: int
    event_name_template: str


HAZARD_MOCK_PROFILES: dict[HazardType, HazardMockProfile] = {
    HazardType.FLOODS: HazardMockProfile(
        severity_key=SeverityKey.RETURN_PERIOD,
        raster_layer=LayerName.FLOOD_DEPTH,
        severity_value_base=5.0,
        severity_value_step=5.0,
        ensemble_member_count=3,
        time_interval_count=2,
        event_name_template="{country}_station-{index}",
    ),
    HazardType.TROPICAL_CYCLONE: HazardMockProfile(
        severity_key=SeverityKey.WIND_SPEED,
        raster_layer=LayerName.WIND_SPEED,
        severity_value_base=25.0,
        severity_value_step=10.0,
        ensemble_member_count=4,
        time_interval_count=3,
        event_name_template="{country}_WP{index:02d}_2026",
    ),
    HazardType.DROUGHT: HazardMockProfile(
        severity_key=SeverityKey.PERCENTILE,
        raster_layer=None,
        severity_value_base=15.0,
        severity_value_step=5.0,
        ensemble_member_count=2,
        time_interval_count=1,
        event_name_template="{country}_zone-{index}_MAM",
    ),
}


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

    profile = HAZARD_MOCK_PROFILES[hazard_type]
    place_codes = list(target_admin_areas.admin_areas.keys())

    for i in range(alert_count):
        event_name = profile.event_name_template.format(country=country, index=i + 1)
        exposed_pcodes = place_codes[i * 2 : (i + 1) * 2] or place_codes[:2]

        data_submitter.create_alert(
            event_name=event_name,
            centroid=Centroid(latitude=float(i), longitude=float(i)),
        )

        _submit_severity_data(data_submitter, event_name, profile, i)

        data_submitter.add_admin_area_exposure(
            event_name=event_name,
            admin_level=target_admin_level,
            layer=LayerName.POPULATION_EXPOSED,
            values_by_place_code={
                pcode: 100 * (i + 1) + pcode_idx * 10
                for pcode_idx, pcode in enumerate(exposed_pcodes)
            },
        )

        if profile.raster_layer is not None:
            data_submitter.add_raster_exposure(
                event_name=event_name,
                layer=profile.raster_layer,
                value_greyscale=PLACEHOLDER_RASTER_BASE64,
                extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
            )


def _submit_severity_data(
    data_submitter: DataSubmitter,
    event_name: str,
    profile: HazardMockProfile,
    alert_index: int,
) -> None:
    base = profile.severity_value_base + alert_index * profile.severity_value_step

    for interval_idx in range(profile.time_interval_count):
        day_offset = interval_idx + 1
        time_start = f"2026-01-{day_offset:02d}T00:00:00Z"
        time_end = f"2026-01-{day_offset:02d}T23:59:59Z"

        for member_idx in range(profile.ensemble_member_count):
            member_variation = base + (member_idx - 1) * 0.5
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start=time_start,
                time_interval_end=time_end,
                ensemble_member_type=EnsembleMemberType.RUN,
                severity_key=profile.severity_key,
                severity_value=member_variation,
            )

        data_submitter.add_severity_data(
            event_name=event_name,
            time_interval_start=time_start,
            time_interval_end=time_end,
            ensemble_member_type=EnsembleMemberType.MEDIAN,
            severity_key=profile.severity_key,
            severity_value=base,
        )
