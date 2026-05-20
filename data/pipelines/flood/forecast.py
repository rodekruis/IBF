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
from pipelines.infra.data_types.loaded_data_types import AlertConfig
from pipelines.infra.data_types.location_point import LocationPoint


def calculate_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    ### Step 1 - Load data from the data provider ###
    alert_configs: list[AlertConfig] = data_provider.get_data(
        DataSource.ALERT_CONFIGS_IBF_API, list
    )
    stations: dict[str, LocationPoint] = data_provider.get_data(
        DataSource.GLOFAS_STATIONS_IBF_API, dict
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )  # TODO AB#41454:  load population using data_provider. This is already available, but as png. For now a tiff is used, which is loaded directly below.

    # TODO: add more data-loaded checks as more sources move to data_provider class
    if not alert_configs or not stations or not target_admin_areas:
        data_submitter.add_error(
            f"Missing input data: alert_configs={bool(alert_configs)}, stations={bool(stations)}, admin_areas={bool(target_admin_areas)}"
        )
        return

    # TODO AB#41454: load these through the data provider once the data sources are registered
    # basins_geojson: dict = data_provider.get_data(
    #     DataSource.HYDROSHEDS_BASINS
    # ).data
    # population_data = data_provider.get_data(DataSource.POPULATION_SEED_REPO)
    # population_raster_path: str = population_data.metadata.get("file_path", "")
    # glofas_netcdf_paths: list[str] = data_provider.get_data(
    #     DataSource.TODO_GLOFAS_DISCHARGE
    # ).data

    # TODO: (placeholder data) replace with data provider calls above once data sources are wired
    # glofas netcdf files
    glofas_netcdf_paths: list[str] = [
        "./pipelines/flood/bronze/glofas/dis_00_2026040800.nc"
    ]
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

    thresholds: list[ReturnPeriodThresholds] = [
        {"station_code": s.id, "thresholds": s.attributes.get("thresholds", [])}
        for s in stations.values()
        if s.attributes.get("thresholds")
    ]

    ### Step 3 - Loop through alert configs (spatial extents / stations) ###
    # DO NOT REMOVE: this loop over spatial-extents is obligatory. TODO-infra: enforce this better.
    for config in alert_configs:
        station_code = config.spatial_extent_name
        station = stations.get(station_code)
        if station is None:
            logging.warning(f"No station location found for '{station_code}', skipping")
            continue

        # DO NOT REMOVE: this loop over temporal-extents is obligatory. TODO-infra: enforce this better.
        for temporal_extent in config.temporal_extents:
            discharges = extract_discharge_glofas_station(
                station_code=station_code,
                station=station,
                netcdf_paths=country_sliced_netcdf_paths,
                temporal_extent=temporal_extent,
            )

            ### Step 4 - Determine temporal extent - which time intervals exceed the minimum return period threshold
            time_interval_severities = determine_temporal_extent(
                station_code=station_code,
                time_interval_discharges=discharges.get(station_code, []),
                thresholds=thresholds,
            )

            # If no time intervals exceeded the minimum return period threshold, skip to the next temporal extent
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
            event_name = f"{country}_floods_{station.name if station.name.lower() != 'na' else station_code}"
            data_submitter.create_alert(
                event_name=event_name,
                centroid=Centroid(
                    latitude=station.lat,
                    longitude=station.lon,
                ),
            )

            for severity in time_interval_severities:
                for i in range(len(severity.ensemble_return_periods)):
                    data_submitter.add_severity_data(
                        event_name=event_name,
                        time_interval_start=severity.time_interval_start,
                        time_interval_end=severity.time_interval_end,
                        ensemble_member_type=EnsembleMemberType.RUN,
                        severity_key="return_period",
                        severity_value=severity.ensemble_return_periods[i],
                    )
                data_submitter.add_severity_data(
                    event_name=event_name,
                    time_interval_start=severity.time_interval_start,
                    time_interval_end=severity.time_interval_end,
                    ensemble_member_type=EnsembleMemberType.MEDIAN,
                    severity_key="return_period",
                    severity_value=severity.median_return_period,
                )

            # TODO: determine place codes by looking at the admin areas in a catchment area.
            # TODO-infra: actually, do not call add_admin_area_exposure per place_code, but just once (per layer)
            for place_code in config.spatial_extent_place_codes:
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
