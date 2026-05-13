from __future__ import annotations

import glob
import json
import logging

from pipelines.flood.compute_alert_extent import compute_alert_extent
from pipelines.flood.determine_alerts import (
    determine_temporal_extent,
    ReturnPeriodThresholds,
)
from pipelines.flood.determine_exposure import (
    aggregate_population_exposed,
    compute_population_exposed,
    determine_spatial_extent,
)
from pipelines.flood.extract_forecast import extract_discharge_glofas_station
from pipelines.flood.utils_raster import (  # TODO-infra: move utils to infra and import in flood pipeline
    get_bounding_box,
    get_raster_extent,
    slice_netcdf_to_bounds,
)
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import Centroid, EnsembleMemberType, Layer
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.location_point import LocationPoint

GLOFAS_MIN_RP_THRESHOLDS = (
    1.5  # GloFAS minimum return period thresholds # TODO-infra: where to put this?
)


def calculate_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    ### Step 1 - Load data from the data provider ###
    stations: dict[str, LocationPoint] = data_provider.get_data(
        DataSource.GLOFAS_STATIONS_SEED_REPO, dict
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )  # TODO AB#41454:  load population using data_provider. This is already available, but as png. For now a tiff is used, which is loaded directly below.
    # Make sure your data loaded
    if not stations or not target_admin_areas:
        data_submitter.add_error(
            f"Missing input data: stations={bool(stations)}, admin_areas={bool(target_admin_areas)}"
        )
        return

    # TODO AB#41454: load these through the data provider once the data sources are registered
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

    # TODO: (placeholder data) replace with data provider calls above once data sources are wired
    # all below data in zip and share in PR
    # glofas netcdf files
    glofas_netcdf_paths: list[str] = [
        "./pipelines/flood/bronze/glofas/dis_00_2026040800.nc"
    ]
    # thresholds for stations json files
    thresholds_path: list[str] = [
        f for f in glob.glob(f"./pipelines/flood/bronze/thresholds/*_{country}.json")
    ]
    thresholds: list[ReturnPeriodThresholds] = []
    for path in thresholds_path:
        with open(path) as f:
            loaded_thresholds = json.load(f)
        thresholds.append(loaded_thresholds)
    # station-district mapping json file (or basins_geojson if mapping with basin instead)
    station_district_mapping_path: str = (
        f"./pipelines/flood/bronze/station-district/{country}_station_district_mapping.json"
    )
    station_district_mapping: dict = {}
    with open(station_district_mapping_path) as f:
        station_district_mapping = json.load(f)
    # population raster tiff file
    population_raster_paths = glob.glob(
        f"./pipelines/flood/bronze/population/{country}.tif"
    )
    population_raster_path: str = (
        population_raster_paths[0] if population_raster_paths else ""
    )
    # flood extent rasters
    flood_extent_paths: list[str] = [
        f
        for f in glob.glob(
            f"./pipelines/flood/bronze/flood_extents/flood_map_{country}_*.tif"
        )
    ]

    ### Step 2 - Extract discharge per station from GloFAS data ###
    country_bounds = get_bounding_box(target_admin_areas)

    # Slice NetCDF files to country bounds once before processing stations
    country_sliced_netcdf_paths: list[str] = []
    for netcdf_path in glofas_netcdf_paths:
        country_sliced_path = slice_netcdf_to_bounds(netcdf_path, country_bounds)
        country_sliced_netcdf_paths.append(country_sliced_path)

    ### Step 3 - Loop through spatial extent (stations and extract discharge) ###
    for station_code, station in stations.items():
        discharges = extract_discharge_glofas_station(
            station_code=station_code,
            station=station,
            netcdf_paths=country_sliced_netcdf_paths,
        )

        ### Step 4 - Determine temporal extent - which time intervals exceed the minimum return period threshold
        time_interval_severities = determine_temporal_extent(
            station_code=station_code,
            time_interval_discharges=discharges.get(station_code, []),
            thresholds=thresholds,
        )

        # If no time intervals exceeded the minimum return period threshold, skip to the next station
        if not time_interval_severities:
            logging.info(f"No alerts for station {station_code}")
            continue

        ### Step 5 - Compute alert extent ###
        flood_extent_path = compute_alert_extent(
            time_interval_severities=time_interval_severities,
            flood_extent_paths=flood_extent_paths,
        )

        ### Step 6 - Determine spatial extent ###
        clipped_flood_extent_path, place_codes_exposed = determine_spatial_extent(
            station=station,
            station_district_mapping=station_district_mapping,
            admin_areas=target_admin_areas,
            flood_extent_raster_path=flood_extent_path,
        )

        if not place_codes_exposed:
            logging.info(f"No place codes for station {station_code}")
            continue

        ### Step 7 - Compute exposure within the flood extent ###
        # Compute population exposed using the clipped flood extent
        population_exposed_raster_path = compute_population_exposed(
            population_raster_path,
            clipped_flood_extent_path,
        )

        if population_exposed_raster_path is None:
            data_submitter.add_error(
                f"Could not compute exposed population raster for station {station_code}"
            )
            continue

        ### Step 8 - Aggregate population exposed per place_code ###
        population_exposed = aggregate_population_exposed(
            population_exposed_raster_path, place_codes_exposed, target_admin_areas
        )

        ### Step 9 - Create alert and submit severity/exposure payloads ###
        if station.name.lower() == "na":
            station.name = station_code
        event_name = f"{country}_floods_{station.name}"
        data_submitter.create_alert(
            event_name=event_name,
            centroid=Centroid(
                latitude=station.lat,
                longitude=station.lon,
            ),
        )

        for severity in time_interval_severities:
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

        # TODO-infra: all pcode at once instead of looping
        for place_code in place_codes_exposed:
            data_submitter.add_admin_area_exposure(
                event_name=event_name,
                place_code=place_code,
                admin_level=target_admin_level,
                layer=Layer.POPULATION_EXPOSED,
                value=population_exposed.get(place_code, 0),
            )
        # TODO: use this in the future to (A) add water-discharege/return-period for glofas-station-popup and (B) add exposure status of points/roads/buildings.
        # data_submitter.add_geo_feature_exposure(
        #     event_name=event_name,
        #     geo_feature_id=station_code,
        #     layer="glofas_stations",
        #     value={"river_discharge": 0},
        # )

        data_submitter.add_raster_exposure(
            event_name=event_name,
            layer="alert_extent",
            value=clipped_flood_extent_path,
            extent=get_raster_extent(clipped_flood_extent_path),
        )
