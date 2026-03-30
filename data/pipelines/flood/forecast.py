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
from pipelines.infra.data_types.location_point import LocationPoint


def calculate_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    deepest_admin_level: int,
) -> None:
    # TEMPLATE IMPLEMENTATION — This function loops over stations from
    # data_provider, but uses dummy/placeholder values for severity, exposure,
    # and raster output.
    #
    # To be implemented by the data scientist:
    # 1. Compute aggregate severity per lead time from discharge data
    # 2. Generate actual flood extent rasters instead of placeholders
    # 3. Compute real population exposure from population raster + flood extent
    # 4. Compute geo-feature exposure (hospitals, roads, etc.)
    stations: dict[str, LocationPoint] = data_provider.get_data("glofas_stations").data
    target_admin_boundaries: AdminAreasSet = data_provider.get_data(
        "admin_boundaries"
    ).data

    if not stations or not target_admin_boundaries:
        data_submitter.add_error(
            f"Missing input data: stations={bool(stations)}, admin_boundaries={bool(target_admin_boundaries)}"
        )
        return

    issued_at = datetime.now(timezone.utc)

    for station_code, station in stations.items():
        alert_name = f"{country}_floods_{station_code}"

        data_submitter.create_alert(
            alert_name=alert_name,
            hazard_types=[HazardType.FLOODS],
            centroid=Centroid(
                latitude=station.lat,
                longitude=station.lon,
            ),
            issued_at=issued_at,
            forecast_sources=[ForecastSource.GLOFAS],
        )

        for _ in range(2):
            data_submitter.add_severity_data(
                alert_name=alert_name,
                lead_time_start="2026-03-20T00:00:00Z",
                lead_time_end="2026-03-20T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.RUN,
                severity_key="water_discharge",
                severity_value=0,
            )
        data_submitter.add_severity_data(
            alert_name=alert_name,
            lead_time_start="2026-03-20T00:00:00Z",
            lead_time_end="2026-03-20T23:59:59Z",
            ensemble_member_type=EnsembleMemberType.MEDIAN,
            severity_key="water_discharge",
            severity_value=0,
        )

        # TODO: determine admin_area_codes by looking at the admin boundaries in a climate region
        # For now, just get the first two place codes from the admin boundaries for debug.
        debug_affected_admin_area_codes: list[str] = list(
            target_admin_boundaries.admin_areas.keys()
        )[:2]

        for place_code in debug_affected_admin_area_codes:
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

        data_submitter.add_geo_feature_exposure(
            alert_name=alert_name,
            geo_feature_id=station_code,
            layer="glofas_stations",
            value={"water_discharge": 0},
        )

        data_submitter.add_raster_exposure(
            alert_name=alert_name,
            layer="alert_extent",
            value=f"alert_extent_{station_code}.tif",
            extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
        )
