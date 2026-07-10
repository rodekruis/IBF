"""
Orchestration for the tropical-cyclone hazard forecast.

STATUS: all five hazard-logic modules are real, wired-in implementations, each verified against
real GEFS/ATCF data - `extract_wind_speed` (`tropical_cyclone/extract_forecast.py`), `extract_track`
(`tropical_cyclone/extract_track.py`), `determine_alert` (`tropical_cyclone/determine_alerts.py`),
`compute_alert_extent` (`tropical_cyclone/compute_wind_extent.py`), `determine_spatial_extent`
(`tropical_cyclone/determine_exposure.py`), and `compute_population_exposed`
(`infra.utils.exposure`). Two `_placeholder_*` functions remain, both intentionally: Step 4's
local-file-path loaders are `# TODO-infra` stubs pending real `DataSource.GEFS_WIND`/
`DataSource.GEFS_TRACK` fetchers, and `_placeholder_issued_datetime` (Step 11's event-name
timestamp) stays a v1 per-run identifier pending a decision on persistent per-storm identity
(IBTrACS/ATCF `CY`) - see that function's docstring.

The hazard is fully registered: `HazardType.TROPICAL_CYCLONE`, `ForecastSource.GEFS`,
`SeverityKey.WIND_SPEED`, `LayerName.WIND_SPEED` all resolve, and the CLI dispatches to this
function for the `tropicalCyclone` hazard type. Still not runnable end to end until the Step 4
data-provider fetchers exist - everything downstream of real wind/track paths is real code now.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from statistics import fmean

from shared.country_data import CountryCodeIso3

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
    get_place_codes_for_alert_config,
)
from pipelines.infra.utils.raster import (
    BoundingBox,
    get_bounding_box,
    get_raster_extent,
    raster_to_base64_png,
)
from pipelines.tropical_cyclone.compute_wind_extent import compute_alert_extent
from pipelines.tropical_cyclone.constants import (
    COUNTRY_CONFIGS,
    MIN_SEVERITY_MS,
    MONITORING_BOX_BUFFER_KM,
)
from pipelines.tropical_cyclone.determine_alerts import (
    determine_alert,
    TimeIntervalSeverity,
)
from pipelines.tropical_cyclone.determine_exposure import determine_spatial_extent
from pipelines.tropical_cyclone.extract_forecast import extract_wind_speed
from pipelines.tropical_cyclone.extract_track import extract_track, TimeIntervalTrackFix


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
    if not target_admin_areas:
        data_submitter.add_error(
            f"Missing input data: admin_areas={bool(target_admin_areas)}"
        )
        return

    ### Step 2 - Resolve the country's config (exposure class, sustained-wind convention) ###
    country_config = COUNTRY_CONFIGS.get(CountryCodeIso3(country))
    if country_config is None:
        data_submitter.add_error(
            f"No config for country '{country}' (see tropical_cyclone/constants.py COUNTRY_CONFIGS)"
        )
        return

    ### Step 3 - Synthesize a whole-country alert config ###
    # No seeded TC alert-configs exist in the API today;
    # depending on DataSource.ALERT_CONFIGS_IBF_API here, like flood/drought do, would make every
    # run fail permanently (the template's "if not alert_configs: add_error; return" guard).
    # get_place_codes_for_alert_config's existing "empty place_codes -> all admin areas at target
    # level" fallback is exactly the "national" extent this hazard needs, so a config is
    # synthesized locally instead.
    alert_config = AlertConfig(
        spatial_extent_name="national",
        spatial_extent_place_codes=[],
        # Pass-through: GEFS lead times aren't bucketed by a lead-time-spectrum value like flood's
        # config does; extract_wind_speed() (once implemented) uses the full GEFS forecast window
        # directly. Kept as one entry for DTO-shape parity with flood/drought's alert configs.
        temporal_extents=[{}],
    )
    spatial_extent_place_codes = get_place_codes_for_alert_config(
        alert_config, target_admin_areas, target_admin_level
    )

    ### Step 4 - Load GEFS wind and track data ###
    # TODO-infra: move to data providers (DataSource.GEFS_WIND, DataSource.GEFS_TRACK) once real
    # fetchers exist. Until then, this
    # reads local GEFS GRIB2 (wind) and ATCF (track) member file paths directly. Two distinct
    # products (different NOMADS subtrees, different formats) — two loads, two guards.
    gefs_wind_member_paths = _placeholder_load_local_gefs_wind_paths(country)
    if not gefs_wind_member_paths:
        data_submitter.add_error(
            f"Missing input data: gefs_wind_member_paths for country '{country}'"
        )
        return

    gefs_track_member_paths = _placeholder_load_local_gefs_track_paths(country)
    if not gefs_track_member_paths:
        data_submitter.add_error(
            f"Missing input data: gefs_track_member_paths for country '{country}'"
        )
        return

    ### Step 5 - Country bounding box ###
    # Computed from admin-area geometry, padded by MONITORING_BOX_BUFFER_KM so the box can
    # see the storm approaching over open ocean before landfall - a small country's own land extent
    # doesn't capture that, especially for a small island. The buffer is a placeholder pending domain-owner validation - see
    # MONITORING_BOX_BUFFER_KM's docstring.
    country_bounds = _pad_bounding_box(
        get_bounding_box(target_admin_areas), MONITORING_BOX_BUFFER_KM
    )

    ### Step 6 - Extract wind speed per ensemble member, determine the alert gate ###
    # extract_wind_speed resolves the per-country conversion factor internally (Axis 1: the
    # country's averaging-period convention; Axis 2: WMO/Harper exposure-class gust factor when
    # Axis 1 is ONE_MINUTE).
    wind_speeds = extract_wind_speed(
        gefs_wind_member_paths, country_bounds, country_config
    )
    time_interval_severities = determine_alert(
        wind_speeds, spatial_extent_place_codes, target_admin_areas
    )

    # If no time bucket clears MIN_SEVERITY_MS, there is no alert for this country.
    if not time_interval_severities:
        logging.info(
            f"No tropical-cyclone alert for '{country}': no bucket cleared "
            f"MIN_SEVERITY_MS={MIN_SEVERITY_MS}"
        )
        return

    ### Step 7 - Extract track fixes for the alert centroid ###
    track_fixes = extract_track(gefs_track_member_paths, country_bounds)

    ### Step 8 - Compute the alert extent and its spatial exposure ###
    wind_extent = compute_alert_extent(time_interval_severities)
    clipped_wind_extent = determine_spatial_extent(
        wind_extent, spatial_extent_place_codes, target_admin_areas
    )

    if clipped_wind_extent is None:
        data_submitter.add_error(
            f"Could not compute wind extent for country '{country}'"
        )
        return

    ### Step 9 - Lazily load the population raster ###
    # Loaded only now, after confirming an alert-worthy footprint exists, to avoid the API call on
    # every no-alert run (mirrors flood's lazy-load).
    population_raster: RasterData = data_provider.get_data(
        DataSource.POPULATION_IBF_API, RasterData
    )

    ### Step 10 - Compute and aggregate population exposure ###
    population_exposed_raster = compute_population_exposed(
        population_raster, clipped_wind_extent
    )
    if population_exposed_raster is None:
        data_submitter.add_error(
            f"Could not compute exposed population raster for country '{country}'"
        )
        return

    population_exposed = aggregate_population_exposed(
        population_exposed_raster, spatial_extent_place_codes, target_admin_areas
    )

    ### Step 11 - Create alert and submit severity/exposure payloads ###
    # v1 identifier: per-country-per-run using the issued datetime. ATCF's CY (cyclone number) is
    # available from track data and could support a persistent per-storm identity across pipeline
    # runs later (so a re-run against an already-alerted storm updates the same event instead of
    # creating a duplicate), but that needs a decision on what "the same storm across runs" means
    # operationally that hasn't been made yet.
    event_name = f"{country}_tropical-cyclone_{_placeholder_issued_datetime()}"

    # Storm-center fix from the same bucket compute_alert_extent picked as peak-intensity (falls
    # back to the admin-area centroid only if there are no track fixes at all - see docstring).
    centroid = _derive_storm_centroid(
        track_fixes, time_interval_severities, target_admin_areas
    )

    data_submitter.create_alert(event_name=event_name, centroid=centroid)

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
        value_greyscale=raster_to_base64_png(clipped_wind_extent),
        extent=get_raster_extent(clipped_wind_extent),
    )


def _pad_bounding_box(bounds: BoundingBox, buffer_km: float) -> BoundingBox:
    """
    Pad a (min_lon, min_lat, max_lon, max_lat) bounding box by buffer_km on every side.
    Degrees-per-km isn't constant: a degree of latitude is ~111.32 km everywhere, but a degree of
    longitude shrinks toward the poles (~111.32 km * cos(latitude)). Uses the box's own mid-latitude
    for that conversion - adequate for a monitoring-box buffer, not survey-grade.
    """
    min_lon, min_lat, max_lon, max_lat = bounds
    km_per_degree_latitude = 111.32
    mid_latitude = (min_lat + max_lat) / 2
    km_per_degree_longitude = km_per_degree_latitude * math.cos(
        math.radians(mid_latitude)
    )

    latitude_buffer_degrees = buffer_km / km_per_degree_latitude
    longitude_buffer_degrees = (
        buffer_km / km_per_degree_longitude if km_per_degree_longitude > 0 else 180.0
    )

    return (
        min_lon - longitude_buffer_degrees,
        min_lat - latitude_buffer_degrees,
        max_lon + longitude_buffer_degrees,
        max_lat + latitude_buffer_degrees,
    )


def _placeholder_load_local_gefs_wind_paths(country: str) -> list[str]:
    """
    TODO-infra: replace with DataSource.GEFS_WIND once a fetcher exists. Until then, should read
    local GEFS GRIB2 wind member file paths for `country` (see extract_forecast.py's
    _GEFS_WIND_PATH_PATTERN for the expected naming convention). Returns an empty list until
    implemented, which correctly halts the pipeline at the Step 4 guard above.
    """
    return []


def _placeholder_load_local_gefs_track_paths(country: str) -> list[str]:
    """
    TODO-infra: replace with DataSource.GEFS_TRACK once a fetcher exists. Until then, should read
    local GEFS ATCF track member file paths for `country` (see extract_track.py's
    _GEFS_TRACK_PATH_PATTERN for the expected naming convention). Returns an empty list until
    implemented, which correctly halts the pipeline at the Step 4 guard above.
    """
    return []


def _placeholder_issued_datetime() -> str:
    """Placeholder for the event-name timestamp, used until a persistent per-storm identity (keyed
    off ATCF's CY cyclone number) replaces this per-run identifier - see the note above this
    function's one call site."""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _derive_storm_centroid(
    time_interval_track_fixes: list[TimeIntervalTrackFix],
    time_interval_severities: list[TimeIntervalSeverity],
    admin_areas: AdminAreasSet,
) -> Centroid:
    """
    Mean lat/lon across ensemble members at the same bucket compute_alert_extent picks as
    peak-intensity (highest MEDIAN wind speed) - the alert centroid should reflect where the storm
    actually is at the moment being reported, not a flat average smeared across the whole forecast
    window. Falls back to every bucket's fixes combined if track data has no fix at exactly that
    time (track's native cadence can differ from whatever wind lead times were fetched), and to the
    admin-area centroid only when there are no track fixes at all (e.g. no storm currently within
    the country's monitoring box).
    """
    peak_bucket = max(
        time_interval_severities, key=lambda severity: severity.median_wind_speed
    )
    peak_track_bucket = next(
        (
            bucket
            for bucket in time_interval_track_fixes
            if bucket.time_interval_start == peak_bucket.time_interval_start
        ),
        None,
    )

    fixes = (
        peak_track_bucket.ensemble_track_fixes
        if peak_track_bucket is not None and peak_track_bucket.ensemble_track_fixes
        else [
            fix
            for bucket in time_interval_track_fixes
            for fix in bucket.ensemble_track_fixes
        ]
    )
    if fixes:
        return Centroid(
            latitude=fmean(fix.latitude for fix in fixes),
            longitude=fmean(fix.longitude for fix in fixes),
        )

    geometries = [area.to_geometry() for area in admin_areas.admin_areas.values()]
    if not geometries:
        return Centroid(latitude=0.0, longitude=0.0)

    geometry_centroids = [geometry.centroid for geometry in geometries]
    return Centroid(
        latitude=fmean(point.y for point in geometry_centroids),
        longitude=fmean(point.x for point in geometry_centroids),
    )
