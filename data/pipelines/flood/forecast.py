from __future__ import annotations

import logging
from typing import cast

from pipelines.flood.compute_flood_extent import compute_flood_extent
from pipelines.flood.determine_alerts import (
    determine_temporal_extent,
    ReturnPeriodThresholds,
    ReturnPeriodThresholdValue,
)
from pipelines.flood.determine_exposure import (
    compute_population_exposed,
    determine_spatial_extent,
)
from pipelines.flood.extract_forecast import extract_discharge_glofas_station
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import EnsembleMemberType, Layer, SeverityKey
from pipelines.infra.data_types.flood_extent_provider import FloodExtentProvider
from pipelines.infra.data_types.loaded_data_types import AlertConfig, RasterData
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.exposure import aggregate_population_exposed
from pipelines.infra.utils.raster import (
    get_bounding_box,
    get_raster_extent,
    raster_to_base64_png,
    slice_netcdf_to_bounds,
)
from pipelines.infra.utils.storage_helpers import (
    archive_alert_glofas_files,
    get_glofas_country_split_path,
)


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
    glofas_stations: dict[str, LocationPoint] = data_provider.get_data(
        DataSource.GLOFAS_STATIONS_IBF_API, dict
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )
    flood_extent_provider: FloodExtentProvider = data_provider.get_data(
        DataSource.FLOOD_EXTENTS_SEED_REPO, FloodExtentProvider
    )

    if (
        not alert_configs
        or not glofas_stations
        or not target_admin_areas
        or not flood_extent_provider
    ):
        data_submitter.add_error(
            f"Missing input data: alert_configs={bool(alert_configs)}, glofas_stations={bool(glofas_stations)}, admin_areas={bool(target_admin_areas)}, flood_extents={bool(flood_extent_provider)}"
        )
        return

    population_raster: RasterData | None = None

    glofas_netcdf_paths = _get_glofas_discharge_paths(data_provider)

    ### Step 2 - Extract discharge per station from GloFAS data ###
    glofas_station_thresholds: list[ReturnPeriodThresholds] = [
        {
            "station_code": station.id,
            "thresholds": cast(
                list[ReturnPeriodThresholdValue],
                station.attributes["thresholds"],
            ),
        }
        for station in glofas_stations.values()
    ]

    country_bounds = get_bounding_box(
        target_admin_areas, point_locations=glofas_stations
    )

    # Slice NetCDF files to country bounds once before processing stations
    country_sliced_netcdf_paths: list[str] = []
    for netcdf_path in glofas_netcdf_paths:
        country_sliced_path = slice_netcdf_to_bounds(
            netcdf_path,
            country_bounds,
            get_glofas_country_split_path(country, netcdf_path),
        )
        country_sliced_netcdf_paths.append(country_sliced_path)

    ### Step 3 - Loop through alert configs (spatial extents / stations) ###
    # REQUIRED: loop over spatial extents (alert configs)
    for config in alert_configs:
        station_code = config.spatial_extent_name
        station = glofas_stations.get(station_code)
        if station is None:
            logging.warning(f"No station location found for '{station_code}', skipping")
            continue

        # REQUIRED: loop over temporal extents (even though there is just one temporal extent for floods - the extent of all lead times - stick to the generic pattern of looping over temporal extents defined in the alert config
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
                thresholds=glofas_station_thresholds,
            )

            # If no time intervals exceeded the minimum return period threshold, skip to the next temporal extent
            if not time_interval_severities:
                logging.info(f"No alerts for station {station_code}")
                continue

            ### Step 5 - Compute flood extent
            flood_extent = compute_flood_extent(
                time_interval_severities=time_interval_severities,
                flood_extent_provider=flood_extent_provider,
            )

            ### Step 6 - Determine spatial extent
            clipped_flood_extent, place_codes_exposed = determine_spatial_extent(
                station=station,
                station_place_codes=config.spatial_extent_place_codes,
                admin_areas=target_admin_areas,
                flood_extent_raster=flood_extent,
            )

            if not place_codes_exposed or clipped_flood_extent is None:
                logging.info(f"No place codes for station {station_code}")
                continue

            ### Step 7 - Compute exposure within the flood extent ###
            # Load here instead of at the top since this is a costly operation and only needed if there is exposure to compute.
            # the 'if' makes sure, it's only loaded once for the first alert-station
            # TODO: this is not actually lazy-loading at the moment, only lazy-reading earlier downloaded data. Consider true lazy loading.
            if population_raster is None:
                population_raster = data_provider.get_data(
                    DataSource.POPULATION_SEED_REPO, RasterData
                )  # TODO AB#42339: switch to loading population raster from IBF API (geo-features).

            population_exposed_raster = compute_population_exposed(
                population_raster,
                clipped_flood_extent,
            )

            if population_exposed_raster is None:
                data_submitter.add_error(
                    f"Could not compute exposed population raster for station {station_code}"
                )
                continue

            ### Step 8 - Aggregate population exposed per place_code ###
            population_exposed = aggregate_population_exposed(
                population_exposed_raster, place_codes_exposed, target_admin_areas
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
                        severity_key=SeverityKey.RETURN_PERIOD,
                        severity_value=severity.ensemble_return_periods[i],
                    )
                data_submitter.add_severity_data(
                    event_name=event_name,
                    time_interval_start=severity.time_interval_start,
                    time_interval_end=severity.time_interval_end,
                    ensemble_member_type=EnsembleMemberType.MEDIAN,
                    severity_key=SeverityKey.RETURN_PERIOD,
                    severity_value=severity.median_return_period,
                )

            data_submitter.add_admin_area_exposure(
                event_name=event_name,
                admin_level=target_admin_level,
                layer=Layer.POPULATION_EXPOSED,
                values_by_place_code=population_exposed,
            )

            # TODO: use this in the future to (A) add water-discharge/return-period for glofas-station-popup and (B) add exposure status of points/roads/buildings.
            # data_submitter.add_geo_feature_exposure(
            #     event_name=event_name,
            #     geo_feature_id=station_code,
            #     layer=Layer.GLOFAS_STATIONS,
            #     attributes={"river_discharge": 0},
            # )

            data_submitter.add_raster_exposure(
                event_name=event_name,
                layer=Layer.FLOOD_DEPTH,
                value_black_white=raster_to_base64_png(clipped_flood_extent),
                extent=get_raster_extent(clipped_flood_extent),
            )

            ### Step 9 - Actions after alert submitted ###
            # Save the source GloFAS data to a folder with longer retention
            archive_alert_glofas_files(country_sliced_netcdf_paths)


def _get_glofas_discharge_paths(data_provider: DataProvider) -> list[str]:
    for source in (
        DataSource.GLOFAS_DISCHARGE_FTP,
        DataSource.GLOFAS_DISCHARGE_SEED_REPO_ALERT,
        DataSource.GLOFAS_DISCHARGE_SEED_REPO_NO_ALERT,
    ):
        if source in data_provider.loaded_data:
            return data_provider.get_data(source, list)
    raise KeyError(
        "No GloFAS discharge source configured. "
        "Add 'glofas_discharge_ftp' or 'glofas_discharge_seed_repo_alert/no_alert' to data_sources in config."
    )
