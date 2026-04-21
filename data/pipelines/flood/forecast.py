from __future__ import annotations

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import Centroid, EnsembleMemberType, Layer
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.location_point import LocationPoint


def calculate_flood_forecasts(
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

    stations: dict[str, LocationPoint] = data_provider.get_data(
        DataSource.GLOFAS_STATIONS_SEED_REPO, dict
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_SEED_REPO, AdminAreasSet
    )
    # Make sure your data loaded
    if not stations or not target_admin_areas:
        data_submitter.add_error(
            f"Missing input data: stations={bool(stations)}, admin_areas={bool(target_admin_areas)}"
        )
        return

    # Step 2 - Calculate the forecast
    # NOTE: the code in here is purely for demonstration purposes and should be replaced with actual logic, which should include:
    # - Loop over potential spatial extents (glofas stations)
    # - Compute aggregate severity per time interval and overall
    # - If minimum severity threshold is passed, create an alert
    # - Generate actual flood extent rasters instead of placeholders
    # - Compute real population exposure from population raster + flood extent
    # - Compute geo-feature exposure (hospitals, roads, etc.)

    for station_code, station in stations.items():
        event_name = f"{country}_floods_{station.name}"

        data_submitter.create_alert(
            event_name=event_name,
            centroid=Centroid(
                latitude=station.lat,
                longitude=station.lon,
            ),
        )

        for _ in range(2):
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start="2026-03-20T00:00:00Z",
                time_interval_end="2026-03-20T23:59:59Z",
                ensemble_member_type=EnsembleMemberType.RUN,
                severity_key="water_discharge",
                severity_value=0,
            )
        data_submitter.add_severity_data(
            event_name=event_name,
            time_interval_start="2026-03-20T00:00:00Z",
            time_interval_end="2026-03-20T23:59:59Z",
            ensemble_member_type=EnsembleMemberType.MEDIAN,
            severity_key="water_discharge",
            severity_value=0,
        )

        # TODO: determine place codes by looking at the admin areas in a catchment area.
        # For now, just get the first two place codes from the admin areas for debug.
        debug_alert_place_codes: list[str] = list(
            target_admin_areas.admin_areas.keys()
        )[:2]

        # TODO: actually, do not call add_admin_area_exposure per place_code, but just once (per layer)
        for place_code in debug_alert_place_codes:
            data_submitter.add_admin_area_exposure(
                event_name=event_name,
                place_code=place_code,
                admin_level=target_admin_level,
                layer=Layer.POPULATION_EXPOSED,
                value=0,
            )

        data_submitter.add_geo_feature_exposure(
            event_name=event_name,
            geo_feature_id=station_code,
            layer="glofas_stations",
            value={"water_discharge": 0},
        )

        data_submitter.add_raster_exposure(
            event_name=event_name,
            layer="alert_extent",
            value=f"alert_extent_{station_code}.tif",
            extent={"xmin": -1, "ymin": -1, "xmax": 1, "ymax": 1},
        )
