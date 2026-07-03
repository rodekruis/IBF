"""
Orchestration for the tropical-cyclone hazard forecast.

STATUS: skeleton, not yet runnable end to end.
"Orchestration in forecast.py" step by step. Steps 4, 6, 7 and 10 currently call `_placeholder_*`
functions instead of real hazard modules — each placeholder's docstring names the file/function
mirrors flood logic. Land one placeholder per commit (add the new
module, import the real function, delete the placeholder) so each commit stays small and
reviewable.

Two things are deliberately ON HOLD as of 2026-07-03 — do not restart either without checking with
the relevant owner first:
- Plan Batch 2 "Step 0" (moving `compute_population_exposed` out of `flood/determine_exposure.py`
  into shared `infra.utils.exposure`) is the flood data scientist's call, since it's their module
  and call site to change, not made here. `_placeholder_compute_population_exposed` below is a
  tropical-cyclone-local stand-in until that happens; see its docstring for the one-line swap once
  it does.
- Plan Batch 1.2 (`npm run generate:python`) and Batch 1.3 (register in `run_forecasts.py`) both
  wait on data-scientist sign-off before running. This file already references the enum members it
  will need once that regen lands (`SeverityKey.WIND_SPEED`, `Layer.WIND_SPEED`) — they don't exist
  in `enums.py` yet, so *calling* this function today raises `AttributeError`, but *importing* it
  does not. 

"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import fmean

from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import DataSource
from pipelines.infra.data_types.dtos import Centroid
from pipelines.infra.data_types.enums import EnsembleMemberType, Layer, SeverityKey
from pipelines.infra.data_types.loaded_data_types import AlertConfig, RasterData
from pipelines.infra.utils.exposure import (
    aggregate_population_exposed,
    get_place_codes_for_alert_config,
)
from pipelines.infra.utils.raster import (
    BoundingBox,
    get_bounding_box,
    get_raster_extent,
    raster_to_base64_png,
)
from pipelines.tropical_cyclone.constants import (
    CountryConfig,
    COUNTRY_CONFIGS,
    MIN_SEVERITY_MS,
    MONITORING_BOX_BUFFER_KM,
)


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
    country_config = COUNTRY_CONFIGS.get(country)
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
    wind_speeds = _placeholder_extract_wind_speed(
        gefs_wind_member_paths, country_bounds, country_config
    )
    time_interval_severities = _placeholder_determine_alert(wind_speeds, target_admin_areas)

    # If no time bucket clears MIN_SEVERITY_MS, there is no alert for this country.
    if not time_interval_severities:
        logging.info(
            f"No tropical-cyclone alert for '{country}': no bucket cleared "
            f"MIN_SEVERITY_MS={MIN_SEVERITY_MS}"
        )
        return

    ### Step 7 - Extract track fixes for the alert centroid ###
    # Track data is now in scope. Used only for the real storm-center
    track_fixes = _placeholder_extract_track(gefs_track_member_paths, country_bounds)

    ### Step 8 - Compute the alert extent and its spatial exposure ###
    wind_extent = _placeholder_compute_alert_extent(time_interval_severities)
    clipped_wind_extent = _placeholder_determine_spatial_extent(
        wind_extent, spatial_extent_place_codes, target_admin_areas
    )

    if clipped_wind_extent is None:
        data_submitter.add_error(f"Could not compute wind extent for country '{country}'")
        return

    ### Step 9 - Lazily load the population raster ###
    # Loaded only now, after confirming an alert-worthy footprint exists, to avoid the API call on
    # every no-alert run (mirrors flood's lazy-load).
    population_raster: RasterData = data_provider.get_data(
        DataSource.POPULATION_IBF_API, RasterData
    )

    ### Step 10 - Compute and aggregate population exposure ###
    population_exposed_raster = _placeholder_compute_population_exposed(
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
    # v1 identifier: per-country-per-run using the issued datetime, since ATCF's CY (cyclone
    # number) isn't yet adopted for a persistent per-storm identity (see TROPICAL_CYCLONE_PLAN.md
    # Open Items, "Event identity").
    event_name = f"{country}_tropical-cyclone_{_placeholder_issued_datetime()}"

    # Real storm-center fix derived from track data (falls back to the admin-area centroid only
    # while extract_track.py doesn't exist yet - see the function's docstring).
    centroid = _placeholder_derive_storm_centroid(track_fixes, target_admin_areas)

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
        layer=Layer.POPULATION_EXPOSED,
        values_by_place_code=population_exposed,
    )

    # No add_geo_feature_exposure for individual track points yet 
    # Track data is used above only for the derived centroid.

    data_submitter.add_raster_exposure(
        event_name=event_name,
        layer=Layer.WIND_SPEED,
        value_black_white=raster_to_base64_png(clipped_wind_extent),
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
    km_per_degree_longitude = km_per_degree_latitude * math.cos(math.radians(mid_latitude))

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


@dataclass
class _PlaceholderTimeIntervalSeverity:
    """
    Placeholder shape for tropical_cyclone/determine_alerts.py's TimeIntervalSeverity — mirrors
    flood/determine_alerts.py's TimeIntervalSeverity dataclass, renamed for wind speed instead of
    return period. Delete this once determine_alerts.py exists and import the real dataclass
    instead.
    """

    time_interval_start: str
    time_interval_end: str
    median_wind_speed: float
    ensemble_wind_speeds: list[float]


@dataclass
class _PlaceholderTrackFix:
    """
    Placeholder shape for tropical_cyclone/extract_track.py's per-member, per-lead-time ATCF fix
    (columns DTG/TAU/lat/lon/VMAX/MSLP). Delete this
    once extract_track.py exists and import the real dataclass instead.
    """

    time_interval_start: str
    time_interval_end: str
    latitude: float
    longitude: float


def _placeholder_load_local_gefs_wind_paths(country: str) -> list[str]:
    """
    TODO-infra: replace with DataSource.GEFS_WIND once a fetcher exists. Until then, should read local GEFS GRIB2
    wind member file paths for `country` (see Batch 3: typhoon/bronze/gefs_wind/). Returns an empty
    list until implemented, which correctly halts the pipeline at the Step 4 guard above.
    """
    return []


def _placeholder_load_local_gefs_track_paths(country: str) -> list[str]:
    """
    TODO-infra: replace with DataSource.GEFS_TRACK once a fetcher exists. Until then, should read local GEFS ATCF
    track member file paths for `country`. Returns an
    empty list until implemented, which correctly halts the pipeline at the Step 4 guard above.
    """
    return []


def _placeholder_extract_wind_speed(
    gefs_wind_member_paths: list[str],
    bounds: BoundingBox,
    country_config: CountryConfig,
) -> list:
    """
    TODO(tropical_cyclone/extract_forecast.py):
    extract_wind_speed(gefs_member_paths, bounds, country_config) -> list[TimeIntervalWindSpeed].
    Reads GEFS UGRD/VGRD (cfgrib), computes sqrt(u^2+v^2) per member per native 3h step to +240h,
    sliced to `bounds`, then applies the resolved conversion factor: 1.0 if
    `country_config.sustained_wind_averaging_period` is TEN_MINUTE, else
    `WMO_HARPER_10MIN_TO_1MIN_FACTOR[country_config.exposure_class]`. See
    TROPICAL_CYCLONE_PLAN.md "Averaging-period conversion" and Batch 2 table.
    """
    return []


def _placeholder_determine_alert(
    wind_speeds: list,
    admin_areas: AdminAreasSet,
) -> list[_PlaceholderTimeIntervalSeverity]:
    """
    TODO(tropical_cyclone/determine_alerts.py): determine_alert(...). Per time bucket, must compute
    the per-cell ensemble-median raster FIRST - clipped to the country's own admin-area union (the
    land mask) - then take that raster's max as both the gate scalar and the MEDIAN severity value
    (compared directly against the flat MIN_SEVERITY_MS, no category lookup); per-member
    land-masked max scalars are the RUN severity values.
    """
    return []


def _placeholder_extract_track(
    gefs_track_member_paths: list[str],
    bounds: BoundingBox,
) -> list[_PlaceholderTrackFix]:
    """
    TODO(tropical_cyclone/extract_track.py): extract_track(track_member_paths, bounds) ->
    list[TimeIntervalTrackFix]. Parses gunzipped ATCF CSV per member (DTG/TAU/lat/lon/VMAX/MSLP),
    sliced to `bounds`.
    """
    return []


def _placeholder_compute_alert_extent(
    time_interval_severities: list[_PlaceholderTimeIntervalSeverity],
) -> RasterData:
    """
    TODO(tropical_cyclone/compute_wind_extent.py): compute_alert_extent(time_interval_severities)
    -> RasterData. Picks the qualifying bucket with the highest median wind speed (peak-intensity
    moment, mirrors flood picking the worst return-period day), masks its raster where
    > MIN_SEVERITY_MS.
    """
    raise NotImplementedError(
        "compute_alert_extent placeholder reached with non-empty time_interval_severities; "
        "implement tropical_cyclone/compute_wind_extent.py before this can run for real."
    )


def _placeholder_determine_spatial_extent(
    wind_extent: RasterData,
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> RasterData | None:
    """
    TODO(tropical_cyclone/determine_exposure.py): determine_spatial_extent(...) - a thin wrapper
    over infra.utils.exposure.clip_raster_to_admin_areas (no per-station filtering needed - TC's
    extent is whole-country).
    """
    return None


def _placeholder_compute_population_exposed(
    population_raster: RasterData,
    wind_extent_raster: RasterData,
) -> RasterData | None:
    """
    Tropical-cyclone-local stand-in for infra.utils.exposure.compute_population_exposed. Plan moving this out of flood/determine_exposure.py into shared infra) is ON HOLD,
    owned by the flood data scientist - not this hazard's call to make. Once it moves: delete this
    function and replace its one call site above with
    `from pipelines.infra.utils.exposure import compute_population_exposed`.
    """
    return None


def _placeholder_issued_datetime() -> str:
    """Placeholder for the event-name timestamp. See Open Items: 'Event identity'."""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _placeholder_derive_storm_centroid(
    track_fixes: list[_PlaceholderTrackFix],
    admin_areas: AdminAreasSet,
) -> Centroid:
    """
    Real per-bucket ensemble storm-center fix (e.g. median lat/lon across members at the
    alert-triggering bucket), once tropical_cyclone/extract_track.py exists and `track_fixes` is
    non-empty. Falls back to the admin-area centroid only as a temporary stand-in while track_fixes
    is always `[]` (extract_track.py not implemented yet) - delete the fallback once it is, since a
    real alert should always have real track fixes by then.
    """
    if track_fixes:
        return Centroid(
            latitude=fmean(fix.latitude for fix in track_fixes),
            longitude=fmean(fix.longitude for fix in track_fixes),
        )

    geometries = [area.to_geometry() for area in admin_areas.admin_areas.values()]
    if not geometries:
        return Centroid(latitude=0.0, longitude=0.0)

    geometry_centroids = [geometry.centroid for geometry in geometries]
    return Centroid(
        latitude=fmean(point.y for point in geometry_centroids),
        longitude=fmean(point.x for point in geometry_centroids),
    )
