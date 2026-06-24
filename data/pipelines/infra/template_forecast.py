"""
Template forecast function for a new hazard type.

Copy this file to pipelines/<hazard_type>/forecast.py and implement
the hazard-specific logic. Then register the function in run_forecasts.py.

The function signature MUST match the HazardFunction type:
    (DataProvider, DataSubmitter, str, int) -> None
"""

from __future__ import annotations

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import EnsembleMemberType, Layer, SeverityKey
from pipelines.infra.data_types.loaded_data_types import AlertConfig
from pipelines.infra.utils.exposure import get_place_codes_for_alert_config
from pipelines.infra.utils.raster import PLACEHOLDER_RASTER_BASE64


def calculate_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    # Step 1 - Get data supplied by the data provider.
    # For early prototyping, fetch a new data source here directly.
    # Once stable, inform software-dev to add it to the data provider config.
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

    # Step 2 - Calculate the forecast.
    # Replace the placeholder logic below with actual hazard-specific computations:
    # - Determine severity per ensemble member
    # - Generate hazard extent rasters
    # - Compute population exposure from population raster + hazard extent
    # - Compute geo-feature exposure (hospitals, roads, etc.)

    # REQUIRED: loop over spatial extents (alert configs)
    for config in alert_configs:
        spatial_extent_place_codes = get_place_codes_for_alert_config(
            config, target_admin_areas, target_admin_level
        )

        # REQUIRED: loop over temporal extents (seasons / lead times)
        for temporal_extent in config.temporal_extents:
            season = next(iter(temporal_extent.keys()), config.spatial_extent_name)
            event_name = f"{country}_<hazard>_{config.spatial_extent_name}_{season}"

            # Step 3 - Create an alert and submit severity data.
            data_submitter.create_alert(
                event_name=event_name,
                centroid=Centroid(latitude=0.0, longitude=0.0),
            )

            # At least 1 RUN + 1 MEDIAN severity record per time interval is required.
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start="2026-01-01T00:00:00Z",
                time_interval_end="2026-03-31T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.RUN,
                severity_key=SeverityKey.RETURN_PERIOD,  # replace with your hazard's severity key
                severity_value=0,
            )
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start="2026-01-01T00:00:00Z",
                time_interval_end="2026-03-31T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.MEDIAN,
                severity_key=SeverityKey.RETURN_PERIOD,  # replace with your hazard's severity key
                severity_value=0,
            )

            # Step 4 - Submit exposure data per admin area.
            data_submitter.add_admin_area_exposure(
                event_name=event_name,
                admin_level=target_admin_level,
                layer=Layer.POPULATION_EXPOSED,
                values_by_place_code={
                    place_code: 0 for place_code in spatial_extent_place_codes
                },
            )

            # Step 5 - Submit raster exposure (if applicable)
            # Placeholder value: template forecasts are used only to validate the
            # pipeline structure; replace with actual encoded raster data.
            data_submitter.add_raster_exposure(
                event_name=event_name,
                layer=Layer.FLOOD_DEPTH,  # replace with your hazard's raster layer
                value_black_white=PLACEHOLDER_RASTER_BASE64,
                extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
            )

            # Step N - Actions after alert submitted (optional)
            # This is a good place to archive source data for longer retention if needed.
