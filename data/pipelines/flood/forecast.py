from __future__ import annotations

import logging
import glob
import json
import os

from pipelines.flood.determine_alerts import (
    ReturnPeriodThresholds,
    determine_alert_stations,
)
from pipelines.flood.determine_exposure import determine_exposure
from pipelines.flood.extract_forecast_data import extract_glofas_station_discharge
from pipelines.flood.resolve_flood_extent import resolve_flood_extent_raster
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import Centroid, EnsembleMemberType, Layer
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.flood.utils_raster import ( # TODO-infra: move utils to infra and import in flood pipeline
    clip_raster_to_bounds,
    get_bounding_box,
    get_raster_extent,
)


GLOFAS_MIN_RP_THRESHOLDS = 1.5  # GloFAS minimum return period thresholds # TODO-infra: where to put this?

def calculate_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    # Step 1 - Load data from the data provider
    stations: dict[str, LocationPoint] = data_provider.get_data(
        DataSource.GLOFAS_STATIONS_SEED_REPO, dict
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_SEED_REPO, AdminAreasSet
    )    # TODO:  load population using data_provider once data source is registered

    if not stations or not target_admin_areas:
        data_submitter.add_error(
            f"Missing input data: stations={bool(stations)}, admin_areas={bool(target_admin_areas)}"
        )
        return

    # TODO: load these through the data provider once the data sources are registered
    # thresholds: dict[str, dict[str, float]] = data_provider.get_data(
    #     DataSource.GLOFAS_MIN_RP_THRESHOLDS
    # ).data
    # basins_geojson: dict = data_provider.get_data(
    #     DataSource.HYDROSHEDS_BASINS
    # ).data
    # population_data = data_provider.get_data(DataSource.POPULATION_SEED_REPO)
    # population_raster_path: str = population_data.metadata.get("file_path", "")
    # glofas_netcdf_paths: list[str] = data_provider.get_data(
    #     DataSource.TODO_GLOFAS_DISCHARGE
    # ).data

    # Placeholder data - replace with data provider calls above once data sources are wired
    # put data in zip and share in PR
    glofas_netcdf_paths: list[str] = ["./pipelines/flood/bronze/glofas/dis_00_2026040800.nc"]
    thresholds_path: list[str] = [f for f in glob.glob(f"./pipelines/flood/bronze/thresholds/*_{country}.json")]
    thresholds: list[ReturnPeriodThresholds] = []
    for path in thresholds_path:
        with open(path) as f:
            loaded_thresholds = json.load(f)
        thresholds.append(loaded_thresholds)
    station_district_mapping_path: str = f"./pipelines/flood/bronze/station-district/{country}_station_district_mapping.json"
    station_district_mapping: dict = {}
    with open(station_district_mapping_path) as f:
        station_district_mapping = json.load(f)
    population_raster_paths = glob.glob(f"./pipelines/flood/bronze/population/{country}.tif")
    population_raster_path: str = population_raster_paths[0] if population_raster_paths else ""
    flood_extent_paths: list[str] = [f for f in glob.glob(f"./pipelines/flood/bronze/flood_extents/flood_map_{country}_*.tif")]

    # Step 2 - Compute country bounding box and prepare country-level data
    country_bounds = get_bounding_box(target_admin_areas)

    if population_raster_path:
        population_raster_path = clip_raster_to_bounds(
            population_raster_path, country_bounds
        )

    # Step 3 - Extract discharge per station from GloFAS data (slices NetCDFs to country)
    discharges = extract_glofas_station_discharge(
        stations=stations,
        netcdf_paths=glofas_netcdf_paths,
        country_bounds=country_bounds,
    )

    # Step 4 - Determine which stations exceed the minimum return period threshold
    alert_stations = determine_alert_stations(
        discharges=discharges,
        stations=stations,
        thresholds=thresholds,
    )

    if not alert_stations:
        logging.info("No stations alerted. No alerts to create")
        return

    # Step 5 - Create alerts and determine exposure for alert stations
    for alert_station in alert_stations:
        station_code = alert_station.station_code
        station = alert_station.station
        event_name = f"{country}_floods_{station_code}"

        data_submitter.create_alert(
            event_name=event_name,
            centroid=Centroid(
                latitude=station.lat,
                longitude=station.lon,
            ),
        )

        for severity in alert_station.lead_time_severities:
            for i in range(len(severity.ensemble_discharges)):
                data_submitter.add_severity_data(
                    event_name=event_name,
                    time_interval_start=severity.time_interval_start,
                    time_interval_end=severity.time_interval_end,
                    ensemble_member_type=EnsembleMemberType.RUN,
                    severity_key="water_discharge",
                    severity_value=severity.ensemble_discharges[i],
                )
            data_submitter.add_severity_data(
                event_name=event_name,
                time_interval_start=severity.time_interval_start,
                time_interval_end=severity.time_interval_end,
                ensemble_member_type=EnsembleMemberType.MEDIAN,
                severity_key="water_discharge",
                severity_value=severity.median_discharge,
            )

        # TODO: consider compacting this resolve method
        # Resolve flood extent raster for the highest matched return period
        highest_rp = max(
            alert_station.lead_time_severities,
            key=lambda s: s.median_discharge,
        ).return_period

        flood_extent_path = resolve_flood_extent_raster(
            flood_return_period=highest_rp,
            flood_extent_paths=flood_extent_paths,
        )

        # Determine spatial and population exposure via basin -> admin area mapping
        exposure = determine_exposure(
            station=station, # TODO: correct method input argument to str
            station_district_mapping=station_district_mapping,
            admin_areas=target_admin_areas,
            population_raster_path=population_raster_path,
            flood_extent_raster_path=flood_extent_path,
            target_admin_level=target_admin_level,
        )

        # TODO-infra: all pcode at once instead of looping
        for place_code in exposure.place_codes:
            data_submitter.add_admin_area_exposure(
                event_name=event_name,
                place_code=place_code,
                admin_level=target_admin_level,
                layer=Layer.POPULATION_EXPOSED,
                value=exposure.population_per_place_code.get(place_code, 0),
            )
        # # TODO: add return period in add_geo_feature_exposure
        # data_submitter.add_geo_feature_exposure(
        #     event_name=event_name,
        #     geo_feature_id=station_code,
        #     layer="glofas_stations",
        #     value={"river_discharge": 0},
        # )

        data_submitter.add_raster_exposure(
            event_name=event_name,
            layer="alert_extent",
            value=(
                exposure.clipped_flood_extent_raster_path
            ),
            extent=get_raster_extent(exposure.clipped_flood_extent_raster_path),
        )
