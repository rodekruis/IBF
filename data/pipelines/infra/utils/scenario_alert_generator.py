from __future__ import annotations

from typing import Callable

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import (
    Centroid,
    EnsembleMemberType,
    HazardType,
    Layer,
)
from pipelines.infra.data_types.data_config_types import (
    DataSource,
    Scenario,
    ScenarioType,
)

HazardFunction = Callable[[DataProvider, DataSubmitter, str, int], None]


def make_scenario_hazard_function(
    scenario: Scenario, hazard_type: HazardType
) -> HazardFunction:
    def _scenario_hazard_fn(
        data_provider: DataProvider,
        data_submitter: DataSubmitter,
        country: str,
        target_admin_level: int,
    ) -> None:
        if scenario.type == ScenarioType.NO_ALERT:
            return

        if scenario.type == ScenarioType.ALERT:
            _generate_alert_scenario(
                data_provider, data_submitter, country, target_admin_level, hazard_type
            )

    return _scenario_hazard_fn


def _generate_alert_scenario(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
    hazard_type: HazardType,
) -> None:
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_SEED_REPO, AdminAreasSet
    )
    if not target_admin_areas:
        data_submitter.add_error("Missing admin area data for alert scenario")
        return

    event_name = f"{country}_{hazard_type}_scenario-alert"

    data_submitter.create_alert(
        event_name=event_name,
        centroid=Centroid(latitude=0.0, longitude=0.0),
    )

    for _ in range(2):
        data_submitter.add_severity_data(
            event_name=event_name,
            time_interval_start="2026-01-01T00:00:00Z",
            time_interval_end="2026-01-01T23:59:59Z",
            ensemble_member_type=EnsembleMemberType.RUN,
            severity_key="scenario_severity",
            severity_value=1,
        )
    data_submitter.add_severity_data(
        event_name=event_name,
        time_interval_start="2026-01-01T00:00:00Z",
        time_interval_end="2026-01-01T23:59:59Z",
        ensemble_member_type=EnsembleMemberType.MEDIAN,
        severity_key="scenario_severity",
        severity_value=1,
    )

    place_codes = list(target_admin_areas.admin_areas.keys())[:2]
    for place_code in place_codes:
        data_submitter.add_admin_area_exposure(
            event_name=event_name,
            place_code=place_code,
            admin_level=target_admin_level,
            layer=Layer.POPULATION_EXPOSED,
            value=100,
        )

    data_submitter.add_raster_exposure(
        event_name=event_name,
        layer="alert_extent",
        value="scenario_alert_extent.tif",
        extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
    )
