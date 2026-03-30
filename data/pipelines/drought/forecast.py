from __future__ import annotations

from datetime import datetime, timezone

from pipelines.infra.alert_types import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet


def calculate_drought_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    deepest_admin_level: int,
) -> None:
    # TEMPLATE IMPLEMENTATION — This function loops over climate regions and
    # seasons from data_provider, but uses dummy/placeholder values for
    # severity, exposure, and raster output.
    #
    # To be implemented by the data scientist:
    # 1. Compute severity (percentile) data on right
    # 2. Compute drought extent
    # 3. Compute real population exposure from population raster + drought extent
    # 4. Compute geo-feature exposure (schools, roads, etc.)
    climate_regions: list[dict[str, object]] = data_provider.get_data(
        "climate_regions"
    ).data
    target_admin_boundaries: AdminAreasSet = data_provider.get_data(
        "admin_boundaries"
    ).data

    if not climate_regions or not target_admin_boundaries:
        data_submitter.add_error(
            f"Missing input data: climate_regions={bool(climate_regions)}, admin_boundaries={bool(target_admin_boundaries)}"
        )
        return

    issued_at = datetime.now(timezone.utc)

    for region in climate_regions:
        region_id = str(region["id"])
        seasons: list[str] = region["seasons"]
        # TODO: determine admin_area_codes by looking at the admin boundaries in a climate region
        # For now, just get the first two place codes from the admin boundaries for debug.
        admin_area_codes: list[str] = list(target_admin_boundaries.admin_areas.keys())[
            :2
        ]

        for season in seasons:
            alert_name = f"{country}_drought_{region_id}_season-{season}"

            data_submitter.create_alert(
                alert_name=alert_name,
                hazard_types=[HazardType.DROUGHT],
                centroid=Centroid(latitude=0.0, longitude=0.0),
                issued_at=issued_at,
                forecast_sources=[ForecastSource.ECMWF],
            )

            for _ in range(2):
                data_submitter.add_severity_data(
                    alert_name=alert_name,
                    lead_time_start="2026-03-01T00:00:00Z",
                    lead_time_end="2026-05-31T23:59:59Z",
                    ensemble_member_type=EnsembleMemberType.RUN,
                    severity_key="percentile",
                    severity_value=0,
                )
            data_submitter.add_severity_data(
                alert_name=alert_name,
                lead_time_start="2026-03-01T00:00:00Z",
                lead_time_end="2026-05-31T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.MEDIAN,
                severity_key="percentile",
                severity_value=0,
            )

            for place_code in admin_area_codes:
                data_submitter.add_admin_area_exposure(
                    alert_name=alert_name,
                    place_code=place_code,
                    admin_level=deepest_admin_level,
                    layer=Layer.SPATIAL_EXTENT,
                    value=True,
                )
                data_submitter.add_admin_area_exposure(
                    alert_name=alert_name,
                    place_code=place_code,
                    admin_level=deepest_admin_level,
                    layer=Layer.POPULATION_EXPOSED,
                    value=0,
                )

            data_submitter.add_raster_exposure(
                alert_name=alert_name,
                layer="alert_extent",
                value=f"alert_extent_{region_id}.tif",
                extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
            )
