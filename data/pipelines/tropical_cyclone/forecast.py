"""
Orchestration for the tropical-cyclone hazard forecast.

STATUS: all five hazard-logic modules are real, wired-in implementations, each verified against
real GEFS/ATCF data - `extract_wind_speed` (`tropical_cyclone/extract_forecast.py`), `extract_track`
(`tropical_cyclone/extract_track.py`), `determine_severities` (`tropical_cyclone/determine_alerts.py`),
`compute_alert_spatial_extent` (`tropical_cyclone/compute_wind_spatial_extent.py`), `clip_wind_spatial_extent_to_admin_areas`
(`tropical_cyclone/determine_exposure.py`), and `compute_population_exposed`
(`infra.utils.exposure`). GEFS wind + track are loaded through the DataProvider from the seed repo
(alert/no-alert `DataSource.GEFS_WIND_SEED_REPO_*`/`GEFS_TRACK_SEED_REPO_*`, `--mock`-selected,
downloaded + cached - see `infra/data_types/gefs_product_provider.py`). The remaining `_placeholder_*` functions are Step
3's ECMWF-only local-file-path loaders, reading the most recent cycle from a local test-fixture
directory (`tropical_cyclone/bronze/ecmwf_*`) - still `# TODO AB#44097` pending a real
`DataSource.ECMWF_WIND`/`DataSource.ECMWF_TRACK` fetcher.

Step 1 now fetches `AlertConfig`s (spatial + temporal extents) from `DataSource.ALERT_CONFIGS_IBF_API`
instead of synthesizing one locally - PR #307 seeded a real per-country config
(`spatial_extent_name="National"`, one `"lead-time-spectrum"` temporal extent, currently 3-hour
steps up to 168 hours). Step 6 loops over `alert_configs` x `config.temporal_extents` (each has
exactly one entry for TC today) to match flood/drought's generic structure; `extract_wind_speed`
derives its output bucket width from the temporal extent it's given rather than a hardcoded 3
hours, aggregating GEFS's native cadence up if the configured interval is coarser.

Step 7b loops a third time, over every storm `extract_track` identified, so concurrent cyclones
each raise their own alert. All storms share one wind extraction (GEFS ships one wind field per
cycle, not one per storm), but each is measured only over the admin areas its own track comes near
- see `select_place_codes_near_storm`. Event names are the storm's own identifier (basin + ATCF
cyclone number + season, e.g. `WP11_2026`) and are stable across runs. GEFS only: `extract_track`
raises `NotImplementedError` for ECMWF.

The hazard is fully registered: `HazardType.TROPICAL_CYCLONE`, `ForecastSource.GEFS`,
`SeverityKey.WIND_SPEED`, `LayerName.WIND_SPEED` all resolve, and the CLI dispatches to this
function for the `tropicalCyclone` hazard type. Runnable end to end via the `pipeline` CLI with
`--mock 1` (GEFS wind/track are downloaded from the seed repo), or by direct function call.
`--infra-only` bypasses this function entirely.

TODO AB#44097: delete this full status header block once ECMWF wind/track are also wired
through real `DataSource.ECMWF_WIND`/`DataSource.ECMWF_TRACK` fetchers and the local-fixture
placeholders in this file are removed.
"""

from __future__ import annotations

import logging
from pathlib import Path

from shared.country_data import CountryCodeIso3

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.enums import (
    EnsembleMemberType,
    ForecastSource,
    LayerName,
    SeverityKey,
)
from pipelines.infra.data_types.loaded_data_types import AlertConfig, RasterData
from pipelines.infra.utils import nrw_logger
from pipelines.infra.utils.exposure import (
    aggregate_population_exposed,
    compute_population_exposed,
    get_place_codes_for_alert_config,
)
from pipelines.infra.utils.raster import (
    get_bounding_box,
    get_raster_extent,
    pad_bounding_box,
    raster_to_base64_png,
)
from pipelines.tropical_cyclone.compute_wind_spatial_extent import (
    compute_alert_spatial_extent,
)
from pipelines.tropical_cyclone.constants import (
    COUNTRY_CONFIGS,
    MIN_SEVERITY_MS,
    MONITORING_BOX_BUFFER_KM,
)
from pipelines.tropical_cyclone.determine_alerts import determine_severities
from pipelines.tropical_cyclone.determine_exposure import (
    clip_wind_spatial_extent_to_admin_areas,
)
from pipelines.tropical_cyclone.extract_forecast import extract_wind_speed
from pipelines.tropical_cyclone.extract_track import (
    derive_alert_centroid,
    extract_track,
    find_storm_pairs_sharing_place_codes,
    select_place_codes_near_storm,
)

logger = logging.getLogger(__name__)


def calculate_tropical_cyclone_forecasts(
    data_provider: DataProvider,
    data_submitter: DataSubmitter,
    country: str,
    target_admin_level: int,
) -> None:
    ### Step 1 - Load data from the data provider ###
    target_admin_areas = data_provider.get_data(
        DataSource.ADMIN_AREA_IBF_API, AdminAreasSet
    )
    alert_configs: list[AlertConfig] = data_provider.get_data(
        DataSource.ALERT_CONFIGS_IBF_API, list
    )
    population_raster: RasterData | None = data_provider.get_data(
        DataSource.POPULATION_IBF_API, RasterData
    )
    if not target_admin_areas or not alert_configs or population_raster is None:
        data_submitter.add_error(
            f"Missing input data: admin_areas={bool(target_admin_areas)}, "
            f"alert_configs={bool(alert_configs)}, "
            f"population_raster={population_raster is not None}"
        )
        return

    ### Step 2 - Resolve the country's config (exposure class, sustained-wind convention) ###
    country_config = COUNTRY_CONFIGS.get(CountryCodeIso3(country))
    if country_config is None:
        data_submitter.add_error(
            f"No config for country '{country}' (see tropical_cyclone/constants.py COUNTRY_CONFIGS)"
        )
        return

    ### Step 3 - Load this country's forecast-source wind and track data ###
    # GEFS wind + track are loaded through the DataProvider from the seed repo (see
    # gefs_product_provider.py); ECMWF is still read from local bronze fixtures pending a real
    # fetcher. Two distinct products (different subtrees, different formats) - two loads, two
    # guards.
    # NOTE (extract-layer): the loaded paths are handed to extract_wind_speed and extract_track
    # below. Both are source-aware and dispatch on country_config.forecast_source -
    # extract_wind_speed parses GEFS's per-member GRIB2 or ECMWF's number-keyed ensemble GRIB2, and
    # extract_track parses GEFS's ATCF or ECMWF's BUFR (see extract_forecast.py / extract_track.py).
    if country_config.forecast_source == ForecastSource.GEFS:
        wind_member_paths: list[str] = _get_gefs_product_paths(
            data_provider,
            DataSource.GEFS_WIND_SEED_REPO_ALERT,
            DataSource.GEFS_WIND_SEED_REPO_NO_ALERT,
        )
        track_member_paths: list[str] = _get_gefs_product_paths(
            data_provider,
            DataSource.GEFS_TRACK_SEED_REPO_ALERT,
            DataSource.GEFS_TRACK_SEED_REPO_NO_ALERT,
        )
    elif country_config.forecast_source == ForecastSource.ECMWF:
        wind_member_paths = _placeholder_load_local_ecmwf_wind_paths(country)
        track_member_paths = _placeholder_load_local_ecmwf_track_paths(country)
    else:
        data_submitter.add_error(
            f"Unsupported tropical-cyclone forecast source "
            f"'{country_config.forecast_source}' for country '{country}'"
        )
        return

    if not wind_member_paths:
        data_submitter.add_error(
            f"Missing input data: wind_member_paths for country '{country}'"
        )
        return

    if not track_member_paths:
        data_submitter.add_error(
            f"Missing input data: track_member_paths for country '{country}'"
        )
        return

    ### Step 4 - Country bounding box ###
    # Computed from admin-area geometry, padded by MONITORING_BOX_BUFFER_KM so the box can
    # see the storm approaching over open ocean before landfall - a small country's own land spatial extent
    # doesn't capture that, especially for a small island. The buffer is a placeholder pending domain-owner validation - see
    # MONITORING_BOX_BUFFER_KM's docstring.
    country_bounds = pad_bounding_box(
        get_bounding_box(target_admin_areas), MONITORING_BOX_BUFFER_KM
    )

    ### Step 5 - Gate on whether a cyclone is actually tracked nearby ###
    # An empty result means the configured forecast source's own tracker has nothing identified
    # near the country - no alert to raise. Each tracked storm becomes its own alert (Step 7b).
    storm_tracks = extract_track(
        track_member_paths, country_bounds, country_config.forecast_source
    )
    if not storm_tracks:
        nrw_logger.log_info(
            logger,
            nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
            f"No tropical-cyclone tracked within the monitoring box for '{country}'",
        )
        return

    nrw_logger.log_info(
        logger,
        nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
        f"Tracking {len(storm_tracks)} tropical cyclone(s) near '{country}': "
        f"{', '.join(storm.storm_identifier for storm in storm_tracks)}",
    )

    ### Step 6 - Loop over alert configs (spatial extents) and their temporal extents ###
    # TC has exactly one seeded config ("National") and one temporal extent (the lead-time
    # spectrum) per country today - the loop is still required to keep this hazard's structure
    # generic/consistent with flood and drought (see drought/forecast.py, flood/forecast.py), so
    # shared infra logic never has to special-case tropical cyclone.
    for alert_config in alert_configs:
        spatial_extent_place_codes = get_place_codes_for_alert_config(
            alert_config, target_admin_areas, target_admin_level
        )

        # Scope each storm to the part of this spatial extent it actually threatens. Computed here
        # rather than per temporal extent because it depends only on the storm's track and the
        # spatial extent, neither of which varies with the temporal one.
        place_codes_per_storm = [
            select_place_codes_near_storm(
                storm_track,
                spatial_extent_place_codes,
                target_admin_areas,
                MONITORING_BOX_BUFFER_KM,
            )
            for storm_track in storm_tracks
        ]

        # Storms this close together share admin areas, so the same population is reported as
        # exposed under both events and the two figures must not be summed. Expected for storms
        # within roughly a monitoring box of each other - reported, not treated as an error.
        for first_storm, second_storm in find_storm_pairs_sharing_place_codes(
            storm_tracks, place_codes_per_storm
        ):
            nrw_logger.log_warning(
                logger,
                nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                f"Storms '{first_storm}' and '{second_storm}' were scoped to overlapping admin "
                f"areas in '{alert_config.spatial_extent_name}'; their population-exposed figures "
                f"cover some of the same people and cannot be added together",
            )

        for temporal_extent in alert_config.temporal_extents:
            ### Step 7 - Extract wind speed per ensemble member, determine the alert gate ###
            # extract_wind_speed resolves the per-country conversion factor internally (Axis 1: the
            # country's averaging-period convention; Axis 2: WMO/Harper exposure-class gust factor
            # when Axis 1 is ONE_MINUTE), and buckets its output per temporal_extent's
            # "lead-time-spectrum" (aggregating GEFS's native cadence up to a coarser configured
            # interval if needed - see extract_forecast.py).
            wind_speeds = extract_wind_speed(
                wind_member_paths, country_bounds, country_config, temporal_extent
            )

            ### Step 7b - One alert per tracked storm ###
            # Every storm reads the same wind rasters - GEFS ships one wind field per cycle, not
            # one per storm - but each is measured only over the admin areas it threatens, so a
            # distant storm cannot inherit a landfalling one's severity or exposure.
            for storm_track, storm_place_codes in zip(
                storm_tracks, place_codes_per_storm
            ):
                # Nothing this storm can be measured against. Checked before the severity work
                # below because it is far cheaper, and skipped rather than reported as an error:
                # a storm passing well clear of the country is a normal outcome, and a single
                # add_error would drop every other storm's alert for this country too.
                if not storm_place_codes:
                    nrw_logger.log_info(
                        logger,
                        nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                        f"No tropical-cyclone alert for '{country}' from storm "
                        f"'{storm_track.storm_identifier}' "
                        f"({alert_config.spatial_extent_name}): its track stays more than "
                        f"{MONITORING_BOX_BUFFER_KM}km from every admin area",
                    )
                    continue

                time_interval_severities = determine_severities(
                    storm_track.storm_identifier,
                    wind_speeds,
                    storm_place_codes,
                    target_admin_areas,
                )

                # If no time bucket clears MIN_SEVERITY_MS, this storm raises no alert for this
                # spatial/temporal extent.
                if not time_interval_severities:
                    nrw_logger.log_info(
                        logger,
                        nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                        f"No tropical-cyclone alert for '{country}' from storm "
                        f"'{storm_track.storm_identifier}' "
                        f"({alert_config.spatial_extent_name}): no bucket cleared "
                        f"MIN_SEVERITY_MS={MIN_SEVERITY_MS}",
                    )
                    continue

                # Storm-center point to report. None means the peak wind bucket falls outside the
                # window this storm is tracked over, so that wind cannot be attributed to it.
                centroid = derive_alert_centroid(
                    storm_track.time_interval_track_fixes,
                    time_interval_severities,
                    storm_place_codes,
                    target_admin_areas,
                )
                if centroid is None:
                    nrw_logger.log_info(
                        logger,
                        nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
                        f"No tropical-cyclone alert for '{country}' from storm "
                        f"'{storm_track.storm_identifier}' "
                        f"({alert_config.spatial_extent_name}): the peak wind bucket falls "
                        f"outside that storm's own tracked window",
                    )
                    continue

                ### Step 8 - Compute the alert spatial extent and its spatial exposure ###
                wind_spatial_extent = compute_alert_spatial_extent(
                    time_interval_severities
                )
                clipped_wind_spatial_extent = clip_wind_spatial_extent_to_admin_areas(
                    wind_spatial_extent, storm_place_codes, target_admin_areas
                )

                if clipped_wind_spatial_extent is None:
                    data_submitter.add_error(
                        f"Could not compute wind spatial extent for country '{country}', storm "
                        f"'{storm_track.storm_identifier}'"
                    )
                    continue

                ### Step 9 - Compute and aggregate population exposure ###
                population_exposed_raster = compute_population_exposed(
                    population_raster, clipped_wind_spatial_extent
                )
                if population_exposed_raster is None:
                    data_submitter.add_error(
                        f"Could not compute exposed population raster for country '{country}', "
                        f"storm '{storm_track.storm_identifier}'"
                    )
                    continue

                population_exposed = aggregate_population_exposed(
                    population_exposed_raster,
                    storm_place_codes,
                    target_admin_areas,
                )

                ### Step 10 - Create alert and submit severity/exposure payloads ###
                # Keyed on the storm itself (basin + ATCF cyclone number + season), so the same
                # storm keeps its event across pipeline runs instead of a new one per run.
                # TODO(data-scientist): this name is per storm, not per spatial/temporal extent, so
                # a country seeded with a second alert config or a second temporal extent would
                # submit it twice and create_alert would reject the duplicate. TC has exactly one
                # of each today. What a second temporal extent should even mean for a storm-keyed
                # event is a real design question, deliberately left open rather than papered over
                # with a uniquifying suffix.
                event_name = storm_track.storm_identifier

                data_submitter.create_alert(event_name=event_name, centroid=centroid)

                nrw_logger.log_info(
                    logger,
                    nrw_logger.LogTag.ALERT_GENERATION,
                    f"Alert generated for event '{event_name}' "
                    f"{len(time_interval_severities)} time intervals passed, peak median wind speed "
                    f"{max(severity.median_wind_speed for severity in time_interval_severities):.2f} m/s",
                )

                for severity in time_interval_severities:
                    for ensemble_wind_speed in severity.ensemble_wind_speeds:
                        data_submitter.add_severity_data(
                            event_name=event_name,
                            time_interval_start=severity.time_interval_start,
                            time_interval_end=severity.time_interval_end,
                            ensemble_member_type=EnsembleMemberType.RUN,
                            severity_key=SeverityKey.WIND_SPEED,
                            severity_value=ensemble_wind_speed,
                        )
                    data_submitter.add_severity_data(
                        event_name=event_name,
                        time_interval_start=severity.time_interval_start,
                        time_interval_end=severity.time_interval_end,
                        ensemble_member_type=EnsembleMemberType.MEDIAN,
                        severity_key=SeverityKey.WIND_SPEED,
                        severity_value=severity.median_wind_speed,
                    )

                data_submitter.add_admin_area_exposure(
                    event_name=event_name,
                    admin_level=target_admin_level,
                    layer=LayerName.POPULATION_EXPOSED,
                    values_by_place_code=population_exposed,
                )

                # No add_geo_feature_exposure for individual track points yet
                # Track data is used above only for the derived centroid.

                data_submitter.add_raster_exposure(
                    event_name=event_name,
                    layer=LayerName.WIND_SPEED,
                    value_greyscale=raster_to_base64_png(clipped_wind_spatial_extent),
                    extent=get_raster_extent(clipped_wind_spatial_extent),
                )


def _get_gefs_product_paths(
    data_provider: DataProvider,
    alert_source: DataSource,
    no_alert_source: DataSource,
) -> list[str]:
    # Only one variant is loaded per run: --mock 1 loads the alert source, --mock 0 the no-alert
    # one (mirrors flood/forecast.py::_get_glofas_discharge_paths). Return whichever is present.
    for source in (alert_source, no_alert_source):
        if source in data_provider.loaded_data:
            return data_provider.get_data(source, list)
    raise KeyError(
        f"No GEFS product loaded (expected {alert_source} or {no_alert_source}); "
        "check the tropicalCyclone config data_sources and the --mock flag."
    )


# Local test-fixture roots for ECMWF, not a real data source - see the two functions below. GEFS
# is loaded through DataSource.GEFS_WIND_SEED_REPO_* / GEFS_TRACK_SEED_REPO_* instead (see Step 3);
# ECMWF stays here until it gets an equivalent fetcher. Deliberately just
# `tropical_cyclone/bronze/<dataset>/`, not driven by an env var or CLI flag - whoever builds the
# real ECMWF fetcher should feel free to pick whatever directory layout and live/mock
# source-target wiring suits it.
_LOCAL_ECMWF_WIND_ROOT = Path(__file__).parent / "bronze" / "ecmwf_wind"
_LOCAL_ECMWF_TRACK_ROOT = Path(__file__).parent / "bronze" / "ecmwf_track"


def _placeholder_load_local_ecmwf_wind_paths(country: str) -> list[str]:
    """
    TODO AB#44097: replace with DataSource.ECMWF_WIND once a fetcher exists (as GEFS now is - see
    Step 3). Local-testing stand-in only: reads the most recent `<YYYYMMDD>/<HH>z/...` cycle under
    the ECMWF GRIB2 wind fixture directory, regardless of `country`. The extractor still needs
    ECMWF-aware GRIB2 parsing (member via the GRIB `number` key) before this runs end to end - see
    extract_forecast.py.
    """
    return _most_recent_cycle_files(_LOCAL_ECMWF_WIND_ROOT, date_dir_glob="[0-9]*")


def _placeholder_load_local_ecmwf_track_paths(country: str) -> list[str]:
    """
    TODO AB#44097: replace with DataSource.ECMWF_TRACK once a fetcher exists (as GEFS now is - see
    Step 3). Local-testing stand-in only: the ECMWF track fixture directory. ECMWF tracks are BUFR
    (one file per run, all members/features inside), not ATCF, so extract_track needs BUFR-aware
    parsing before this runs end to end - see extract_track.py.
    """
    return _most_recent_cycle_files(_LOCAL_ECMWF_TRACK_ROOT, date_dir_glob="[0-9]*")


def _most_recent_cycle_files(root: Path, date_dir_glob: str) -> list[str]:
    """
    Picks the most recent `<date_dir>/<hour>` cycle directory under `root` (date and hour dirs
    zero-padded, so a plain string sort on (date, hour) is chronological) and returns every file
    beneath it. `date_dir_glob` selects the source's date-directory naming (e.g. `gefs.*` for
    GEFS, `[0-9]*` for ECMWF's bare `YYYYMMDD`).

    Guards against a real footgun with locally-accumulated test fixtures: extract_wind_speed and
    extract_track both assume every path they're given belongs to the same forecast cycle (they
    derive one `forecast_cycle_datetime` from the first file parsed, and key rasters/fixes only by
    (member, lead_hour) - not by cycle). Two different cycles' files sitting side by side under the
    same root would silently collide (e.g. both cycles happening to have an `f000` for the same
    member) rather than error, so only one cycle's files are ever returned. Mirrors floods'
    `--local-data-date` default of "most recent available date".
    """
    if not root.is_dir():
        return []

    cycle_dirs = sorted(
        (
            hour_dir
            for date_dir in root.glob(date_dir_glob)
            if date_dir.is_dir()
            for hour_dir in date_dir.iterdir()
            if hour_dir.is_dir()
        ),
        key=lambda hour_dir: (hour_dir.parent.name, hour_dir.name),
    )
    if not cycle_dirs:
        return []

    most_recent_cycle_dir = cycle_dirs[-1]
    nrw_logger.log_info(
        logger,
        nrw_logger.LogTag.TROPICAL_CYCLONE_LOGIC,
        f"Using local test fixtures from {most_recent_cycle_dir}",
    )
    return [str(path) for path in most_recent_cycle_dir.rglob("*") if path.is_file()]
