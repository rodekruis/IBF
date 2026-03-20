from __future__ import annotations

from datetime import datetime, timezone

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.models import (
    AdminAreaLayer,
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
)


def calculate_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
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
    stations: list[dict[str, object]] = data_provider.get_data("glofas_stations").data

    issued_at = datetime.now(timezone.utc)

    for station in stations:
        station_code = str(station["station_code"])
        place_codes: list[str] = station["place_codes"]
        alert_id = f"{country}_floods_{station_code}"

        data_submitter.create_alert(
            alert_id=alert_id,
            hazard_types=[HazardType.FLOODS],
            centroid=Centroid(
                latitude=float(station["lat"]),
                longitude=float(station["lon"]),
            ),
            issued_at=issued_at,
            forecast_sources=[ForecastSource.GLOFAS],
        )

        for _ in range(2):
            data_submitter.add_timeseries_data(
                alert_id=alert_id,
                lead_time_start="2026-03-20T00:00:00Z",
                lead_time_end="2026-03-20T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.RUN,
                severity_key="water_discharge",
                severity_value=0,
            )
        data_submitter.add_timeseries_data(
            alert_id=alert_id,
            lead_time_start="2026-03-20T00:00:00Z",
            lead_time_end="2026-03-20T23:59:59Z",
            ensemble_member_type=EnsembleMemberType.MEDIAN,
            severity_key="water_discharge",
            severity_value=0,
        )

        for place_code in place_codes:
            data_submitter.add_admin_area_exposure(
                alert_id=alert_id,
                place_code=place_code,
                layer=AdminAreaLayer.SPATIAL_EXTENT,
                value=True,
            )
            data_submitter.add_admin_area_exposure(
                alert_id=alert_id,
                place_code=place_code,
                layer=AdminAreaLayer.POPULATION_EXPOSED,
                value=0,
            )

        data_submitter.add_geo_feature_exposure(
            alert_id=alert_id,
            geo_feature_id=station_code,
            layer="glofas_stations",
            value={"water_discharge": 0},
        )

        data_submitter.add_raster_exposure(
            alert_id=alert_id,
            layer="alert_extent",
            value=f"alert_extent_{station_code}.tif",
            extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
        )
