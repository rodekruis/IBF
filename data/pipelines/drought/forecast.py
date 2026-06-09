from __future__ import annotations

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import EnsembleMemberType, Layer, SeverityKey
from pipelines.infra.data_types.loaded_data_types import AlertConfig
from pipelines.infra.utils.exposure import get_place_codes_for_alert_config
from pipelines.infra.utils.scenario_alert_generator import PLACEHOLDER_RASTER_BASE64


def calculate_drought_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    ##################################################################################################################################
    # TEMPLATE IMPLEMENTATION
    # — Replace anything in this method/file as wished, but be sure to follow the correct loading and export of the data as outlined here.
    # - To make the code easier to read/maintain, split it into multiple files/methods as needed.
    ##################################################################################################################################

    # Step 1 - Get data supplied by the data provider
    # For early prototyping, just fetch a new data source here directly.
    # As soon as the source is stable enough, inform software-dev to fetch it through the data provider instead.

    alert_configs: list[AlertConfig] = data_provider.get_data(
        DataSource.ALERT_CONFIGS_IBF_API, list
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )

    if not alert_configs or not target_admin_areas:
        data_submitter.add_error(
            f"Missing input data: alert_configs={bool(alert_configs)}, admin_areas={bool(target_admin_areas)}"
        )
        return

    # Step 2 - Calculate the forecast
    # NOTE: the code in here is purely for demonstration purposes and should be replaced with actual logic, which should include:
    # - Loop over alert configs (spatial extents / climate regions) and temporal extents (seasons)
    # - Compute aggregate severity per season
    # - If minimum severity threshold is passed, create an alert
    # - Generate drought extent rasters
    # - Compute population exposure from population raster + drought extent
    # - Compute geo-feature exposure (hospitals, roads, etc.)

    # REQUIRED: loop over spatial extents (alert configs)
    for config in alert_configs:
        spatial_extent_place_codes = get_place_codes_for_alert_config(
            config, target_admin_areas, target_admin_level
        )

        # REQUIRED: loop over temporal extents (seasons)
        for temporal_extent in config.temporal_extents:
            season = next(iter(temporal_extent.keys()), config.spatial_extent_name)
            event_name = f"{country}_drought_{config.spatial_extent_name}_{season}"

            data_submitter.create_alert(
                event_name=event_name,
                centroid=Centroid(latitude=0.0, longitude=0.0),
            )

            for _ in range(2):
                data_submitter.add_severity_data(
                    event_name=event_name,
                    time_interval_start="2026-03-01T00:00:00Z",
                    time_interval_end="2026-05-31T23:59:59Z",
                    ensemble_member_type=EnsembleMemberType.RUN,
                    severity_key=SeverityKey.PERCENTILE,
                    severity_value=0,
                )
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start="2026-03-01T00:00:00Z",
                time_interval_end="2026-05-31T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.MEDIAN,
                severity_key=SeverityKey.PERCENTILE,
                severity_value=0,
            )

            data_submitter.add_admin_area_exposure(
                event_name=event_name,
                admin_level=target_admin_level,
                layer=Layer.POPULATION_EXPOSED,
                values_by_place_code={
                    place_code: 0 for place_code in spatial_extent_place_codes
                },
            )

            data_submitter.add_raster_exposure(
                event_name=event_name,
                layer=Layer.ALERT_EXTENT,
                value_black_white=PLACEHOLDER_RASTER_BASE64,
                extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
            )
