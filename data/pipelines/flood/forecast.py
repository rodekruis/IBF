from __future__ import annotations

import logging
from datetime import datetime, timezone
import glob
import json

from pipelines.flood.determine_alerts import determine_alert_stations
from pipelines.flood.determine_exposure import determine_exposure
from pipelines.flood.extract_glofas_data import extract_glofas_station_discharge
from pipelines.flood.resolve_flood_extent import resolve_flood_extent_raster
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.alert_types import (
    Centroid,
    EnsembleMemberType,
    ForecastSource,
    HazardType,
    Layer,
)
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.utils.raster_utils import ( # TODO-infra: move utils to infra and import in flood pipeline
    clip_raster_to_bounds,
    get_bounding_box,
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
        DataSource.GLOFAS_STATIONS_SEED_REPO
    ).data
    target_admin_areas: AdminAreasSet = data_provider.get_data(
        DataSource.ADMIN_AREA_SEED_REPO
    ).data
    # TODO:  load population using data_provider once data source is registered

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
    thresholds: list[dict] = []
    for path in thresholds_path:
        with open(path) as f:
            thresholds.append(json.load(f))
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
    issued_at = datetime.now(timezone.utc)

    for alert in alert_stations:
        alert_name = f"{country}_floods_{alert.station_code}"

        data_submitter.create_alert(
            alert_name=alert_name,
            hazard_types=[HazardType.FLOODS],
            centroid=Centroid(
                latitude=alert.station.lat,
                longitude=alert.station.lon,
            ),
            issued_at=issued_at,
            forecast_sources=[ForecastSource.GLOFAS],
        )

        # Add severity data per alert lead time
        for severity in alert.lead_time_severities:
            lead_time_start, lead_time_end = _lead_time_to_iso_range(
                issued_at, severity.lead_time
            )
            for discharge in severity.ensemble_discharges:
                data_submitter.add_severity_data(
                    alert_name=alert_name,
                    time_interval_start=lead_time_start,
                    time_interval_end=lead_time_end,
                    ensemble_member_type=EnsembleMemberType.RUN,
                    severity_key="river_discharge",
                    severity_value=discharge,
                )
            data_submitter.add_severity_data(
                alert_name=alert_name,
                time_interval_start=lead_time_start,
                time_interval_end=lead_time_end,
                ensemble_member_type=EnsembleMemberType.MEDIAN,
                severity_key="water_discharge", # check args name
                severity_value=0,
            )

        # TODO: consider compacting this resolve method
        # Resolve flood extent raster for the highest matched return period
        highest_rp = max(
            alert.lead_time_severities,
            key=lambda s: s.median_discharge,
        ).return_period

        flood_extent_path = resolve_flood_extent_raster(
            flood_return_period=highest_rp,
            flood_extent_paths=flood_extent_paths,
        ) if flood_extent_paths else None

        # Determine spatial and population exposure via basin -> admin area mapping
        exposure = determine_exposure(
            station=alert.station,
            station_district_mapping=station_district_mapping,
            admin_areas=target_admin_areas,
            population_raster_path=population_raster_path,
            flood_extent_raster_path=flood_extent_path,
            target_admin_level=target_admin_level,
        )

        if exposure:
            # TODO-infra: all pcode at once instead of looping
            for place_code in exposure.place_codes:
                data_submitter.add_admin_area_exposure(
                    alert_name=alert_name,
                    place_code=place_code,
                    admin_level=target_admin_level,
                    layer=Layer.SPATIAL_EXTENT,
                    value=True,
                )
                data_submitter.add_admin_area_exposure(
                    alert_name=alert_name,
                    place_code=place_code,
                    admin_level=target_admin_level,
                    layer=Layer.POPULATION_EXPOSED,
                    value=exposure.population_per_place_code.get(place_code, 0),
                )
        # TODO: add return period in add_geo_feature_exposure
        # data_submitter.add_geo_feature_exposure(
        #     alert_name=alert_name,
        #     geo_feature_id=alert.station_code,
        #     layer="glofas_stations",
        #     value={"river_discharge": severity.median_discharge},
        # )


def _lead_time_to_iso_range(
    issued_at: datetime, lead_time_days: int
) -> tuple[str, str]:
    """Convert a lead time index (in days) to ISO-8601 start/end strings."""
    from datetime import timedelta

    target_date = issued_at + timedelta(days=lead_time_days)
    start = target_date.strftime("%Y-%m-%dT00:00:00Z")
    end = target_date.strftime("%Y-%m-%dT23:59:59Z")
    return start, end
