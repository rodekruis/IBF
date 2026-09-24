from __future__ import annotations

import json
import logging
from pathlib import Path

from pipelines.compound_flood.constants import BRONZE_DATA_DIR, MINIMUM_SEVERITY_LABEL
from pipelines.compound_flood.determine_alerts import (
    compute_alert_extent_raster,
    determine_temporal_extent,
)
from pipelines.compound_flood.determine_exposure import (
    clip_alert_raster_to_admin_area,
    compute_population_exposure,
)
from pipelines.compound_flood.extract_forecast import extract_flood_depth_series
from pipelines.flood.determine_exposure import determine_spatial_extent
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import EnsembleMemberType, LayerName, SeverityKey
from pipelines.infra.data_types.loaded_data_types import AlertConfig, RasterData
from pipelines.infra.utils.exposure import (
    aggregate_population_exposed,
    compute_population_exposed,
)
from pipelines.infra.utils.nrw_logger import log_error, log_info, log_warning, LogTag
from pipelines.infra.utils.raster import (
    get_bounding_box,
    get_raster_extent,
    raster_to_base64_png,
    slice_netcdf_to_bounds,
)

logger = logging.getLogger(__name__)

SEVERITY_THRESHOLDS_PATH = Path(__file__).parent / "config" / "severity_thresholds.json"


def calculate_compound_flood_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    ### Step 1 - Load data supplied by the data provider ###
    alert_configs: list[AlertConfig] = data_provider.get_data(
        DataSource.ALERT_CONFIGS_IBF_API, list
    )
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )
    # For now DestinE flood-depth NetCDF is fetched directly here
    # TODO: add it to the data provider config
    netcdf_path = _get_destine_netcdf_path()

    if not alert_configs or not target_admin_areas or netcdf_path is None:
        data_submitter.add_error(
            f"Missing input data: alert_configs={bool(alert_configs)}, admin_areas={bool(target_admin_areas)}, destine_netcdf={netcdf_path is not None}"
        )
        return

    alert_config_place_code_errors = validate_alert_config_place_codes(
        alert_configs,
        target_admin_areas,
        country,
    )
    if alert_config_place_code_errors:
        for error in alert_config_place_code_errors:
            log_error(logger, LogTag.FLOOD_LOGIC, error)
            data_submitter.add_error(error)
        return

    population_raster: RasterData | None = None

    ### Step 2 - Slice the NetCDF to country bounds once ###
    #TODO: define thresholds for compound flood severity
    flood_depth_thresholds = _load_flood_depth_thresholds()
    # Not necessary as the provided data is already cropped within PHL, but to keep the pattern consistent with flood hazard logic
    country_bounds = get_bounding_box(target_admin_areas)
    sliced_netcdf_path = slice_netcdf_to_bounds(netcdf_path, country_bounds)

    ### Step 3 - Loop over alert configs (spatial extents / river basins) ###
    # REQUIRED: loop over spatial extents (alert configs)
    for config in alert_configs:
        flood_depth_thresholds: list[ReturnPeriodThresholds] = [
        {
            "pcode": target_admin_area.pcode,
            "thresholds": cast(
                list[ReturnPeriodThresholdValue],
                target_admin_area.attributes["thresholds"],
            ),
        }
        for target_admin_area in target_admin_areas.admin_areas.values()
    ]

        place_codes = [
            place_code
            for place_code in config.spatial_extent_place_codes
            if place_code in target_admin_areas.admin_areas
        ]
        if not place_codes:
            log_info(
                logger,
                LogTag.FLOOD_LOGIC,
                f"No valid place codes for '{config.spatial_extent_name}'",
            )
            continue

        # REQUIRED: loop over temporal extents
        for temporal_extent in config.temporal_extents:
            for place_code in place_codes:
                admin_area = target_admin_areas.admin_areas[place_code]

                flood_depth_series = extract_flood_depth_series(
                    admin_area=admin_area,
                    netcdf_path=sliced_netcdf_path,
                    temporal_extent=temporal_extent,
                )
                
                ### Step 4 - Determine temporal extent - which time intervals exceed the minimum depth threshold
                time_interval_severities = determine_temporal_extent(
                    place_code=place_code,
                    flood_depth_series=flood_depth_series,
                    thresholds=flood_depth_thresholds,
                )
                if not time_interval_severities:
                    log_info(
                        logger,
                        LogTag.FLOOD_LOGIC,
                        f"No alerts for admin area {place_code}",
                    )
                    continue

                # Load here instead of at the top since this is a costly operation and
                # only needed once the first alert is generated.
                if population_raster is None:
                    population_raster = data_provider.get_data(
                        DataSource.POPULATION_IBF_API, RasterData
                    )

                ### Step 5 - Create one alert per alerting lead-time day ###
                for alerting in time_interval_severities:
                    alert_extent_raster = compute_alert_extent_raster(
                        depth_raster=alerting.depth_raster,
                        minimum_threshold=minimum_threshold,
                    )

                    ### Step 6 - Determine spatial extent
                    clipped_depth_raster, place_codes_exposed = determine_spatial_extent(
                        place_code=place_code,
                        admin_areas=target_admin_areas,
                        flood_depth_raster=alerting.depth_raster,
                    )

                    if not place_codes_exposed or clipped_depth_raster is None:
                        log_info(
                            logger,
                            LogTag.FLOOD_LOGIC,
                            f"No place codes for admin area {place_code}",
                        )
                        continue

                    ### Step 7 - Compute exposure within the flood depth ###
                    population_exposed_raster = compute_population_exposed( #TODO: move this and the one in flood to infra?
                        population_raster,
                        clipped_depth_raster,
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
                    event_name = "river_name" #TODO: to fill with the river name mapping from API
                    area_centroid = admin_area.to_geometry().centroid

                    data_submitter.create_alert(
                        event_name=event_name,
                        # For compound floods we agreed that event centroid is the admin-area centroid
                        centroid=Centroid(
                            latitude=area_centroid.y,
                            longitude=area_centroid.x,
                        ),
                    )
                    log_info(
                        logger,
                        LogTag.ALERT_GENERATION,
                        f"Alert generated for event '{event_name}' (pcode {place_code}): "
                        f"{len(time_interval_severities)} time intervals passed, median flood depth "
                        f"{max(severity.median_flood_depth for severity in time_interval_severities):g}m "
                    )

                    # TODO: RETURN_PERIOD is a placeholder carrying the median flood depth in
                    # meters; switch to a dedicated floodDepth severity key once added to the
                    # shared enums. 
                    # The forecast is deterministic, so RUN and MEDIAN are equal.
                    for ensemble_member_type in (
                        EnsembleMemberType.RUN,
                        EnsembleMemberType.MEDIAN,
                    ):
                        data_submitter.add_severity_data(
                            event_name=event_name,
                            time_interval_start=alerting.time_interval_start,
                            time_interval_end=alerting.time_interval_end,
                            ensemble_member_type=ensemble_member_type,
                            severity_key=SeverityKey.RETURN_PERIOD,
                            severity_value=alerting.median_flood_depth,
                        )

                    data_submitter.add_admin_area_exposure(
                        event_name=event_name,
                        admin_level=target_admin_level,
                        layer=LayerName.EXPOSED_POPULATION,
                        values_by_place_code=population_exposed,
                    )

                    data_submitter.add_raster_exposure(
                        event_name=event_name,
                        layer=LayerName.FLOOD_DEPTH,
                        value_greyscale=raster_to_base64_png(clipped_depth_raster),
                        extent=get_raster_extent(clipped_depth_raster),
                    )


def validate_alert_config_place_codes(
    alert_configs: list[AlertConfig],
    target_admin_areas: AdminAreasSet,
    country: str,
) -> list[str]:
    errors: list[str] = []
    available_place_codes = set(target_admin_areas.admin_areas)

    for alert_config in alert_configs:
        missing_place_codes = sorted(
            set(alert_config.spatial_extent_place_codes) - available_place_codes
        )
        if not missing_place_codes:
            continue

        sample = ", ".join(missing_place_codes[:10])
        suffix = (
            f" and {len(missing_place_codes) - 10} more"
            if len(missing_place_codes) > 10
            else ""
        )
        errors.append(
            f"{country} compound flood alert config '{alert_config.spatial_extent_name}' references "
            f"{len(missing_place_codes)} place code(s) not present in target admin areas: "
            f"{sample}{suffix}"
        )

    return errors


def _get_destine_netcdf_path() -> str | None:
    """
    Temp function. To remove when DestinE is added to DataProvider
    Resolve the DestinE flood-depth NetCDF from the local bronze data directory.
    Files ending in '_sliced.nc' are ignored; those are generated pipeline outputs.
    """
    netcdf_files = sorted(
        path
        for path in BRONZE_DATA_DIR.glob("*.nc")
        if not path.stem.endswith("_sliced")
    )
    if not netcdf_files:
        log_warning(
            logger,
            LogTag.FLOOD_LOGIC,
            f"No DestinE NetCDF file found in {BRONZE_DATA_DIR}",
        )
        return None
    if len(netcdf_files) > 1:
        log_warning(
            logger,
            LogTag.FLOOD_LOGIC,
            f"Multiple NetCDF files in {BRONZE_DATA_DIR}; using {netcdf_files[0].name}",
        )
    return str(netcdf_files[0])


def _load_flood_depth_thresholds():
    """#TODO: Load per spatial extent severity thresholds from the local config.
    Return dict[str, float]
    """
    pass
