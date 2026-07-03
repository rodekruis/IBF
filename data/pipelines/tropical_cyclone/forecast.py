"""
Orchestration for the tropical-cyclone hazard forecast.

STATUS: skeleton, not yet runnable end to end. Steps 4, 6, 7 and 9 currently
call `_placeholder_*` functions instead of real hazard modules — each placeholder's
docstring names the file/function mirroring floods pipeline will replace it.
Land one placeholder per commit (add the new module, import the real function, delete
the placeholder) so each commit stays small and reviewable; leave the surrounding
control flow in this file untouched while doing so.

Two things are deliberately ON HOLD as of 2026-07-03 — do not restart either without
checking with the relevant owner first:
- Moving `compute_population_exposed` out of
  `flood/determine_exposure.py` into shared `infra.utils.exposure`) is the flood data
  scientist's call, since it's their module and their call site to change, not made
  here. `_placeholder_compute_population_exposed` below is a tropical-cyclone-local
  stand-in until that move happens; see its docstring for the one-line swap once it does.
- `npm run generate:python` andregister in`run_forecasts.py`) both wait on data-scientist sign-off before running. This file
  already references the enum members it will need once that regen lands
  (`SeverityKey.WIND_SPEED`, `Layer.WIND_SPEED`) — they don't exist in `enums.py` yet,
  so *calling* this function today raises `AttributeError`, but *importing* it does
  not.
"""

from __future__ import annotations

import logging
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
from pipelines.tropical_cyclone.constants import Basin, COUNTRY_BASIN, MIN_SEVERITY_MS


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

    ### Step 2 - Resolve the country's basin ###
    basin = COUNTRY_BASIN.get(country)
    if basin is None:
        data_submitter.add_error(
            f"No basin configured for country '{country}' "
            "(see tropical_cyclone/constants.py COUNTRY_BASIN)"
        )
        return

    ### Step 3 - Synthesize a whole-country alert config ###
    # No seeded TC alert-configs exist in the API today 
    # depending on DataSource.ALERT_CONFIGS_IBF_API here, like flood/drought
    # do, would make every run fail permanently (the template's "if not alert_configs:
    # add_error; return" guard). get_place_codes_for_alert_config's existing "empty
    # place_codes -> all admin areas at target level" fallback is exactly the "national"
    # extent this hazard needs, so a config is synthesized locally instead.
    alert_config = AlertConfig(
        spatial_extent_name="national",
        spatial_extent_place_codes=[],
        # Pass-through: GEFS lead times aren't bucketed by a lead-time-spectrum value
        # like flood's config does; extract_wind_speed() (once implemented) uses the
        # full GEFS forecast window directly. Kept as one entry for DTO-shape parity
        # with flood/drought's alert configs.
        temporal_extents=[{}],
    )
    spatial_extent_place_codes = get_place_codes_for_alert_config(
        alert_config, target_admin_areas, target_admin_level
    )

    ### Step 4 - Load GEFS wind data ###
    # TODO-infra: move to a data provider (DataSource.GEFS_FORECAST) once a real
    # fetcher exists (see TROPICAL_CYCLONE_PLAN.md Batch 5, TODO-infra item 1). Until
    # then, this reads local GEFS GRIB2 member file paths directly.
    gefs_member_paths = _placeholder_load_local_gefs_paths(country)
    if not gefs_member_paths:
        data_submitter.add_error(
            f"Missing input data: gefs_member_paths for country '{country}'"
        )
        return

    ### Step 5 - Compute the country bounding box ###
    # No point_locations: unlike flood's GloFAS stations, TC has no station-equivalent.
    country_bounds = get_bounding_box(target_admin_areas)

    ### Step 6 - Extract wind speed per ensemble member, determine the alert gate ###
    wind_speeds = _placeholder_extract_wind_speed(gefs_member_paths, country_bounds, basin)
    time_interval_severities = _placeholder_determine_alert(
        wind_speeds, basin, target_admin_areas
    )

    # If no time bucket clears MIN_SEVERITY_MS[basin], there is no alert for this country.
    if not time_interval_severities:
        logging.info(
            f"No tropical-cyclone alert for '{country}': no bucket cleared "
            f"MIN_SEVERITY_MS[{basin}]={MIN_SEVERITY_MS.get(basin)}"
        )
        return

    ### Step 7 - Compute the alert extent and its spatial exposure ###
    wind_extent = _placeholder_compute_alert_extent(time_interval_severities, basin)
    clipped_wind_extent = _placeholder_determine_spatial_extent(
        wind_extent, spatial_extent_place_codes, target_admin_areas
    )

    if clipped_wind_extent is None:
        data_submitter.add_error(f"Could not compute wind extent for country '{country}'")
        return

    ### Step 8 - Lazily load the population raster ###
    # Loaded only now, after confirming an alert-worthy footprint exists, to avoid the
    # API call on every no-alert run (mirrors flood's lazy-load).
    population_raster: RasterData = data_provider.get_data(
        DataSource.POPULATION_IBF_API, RasterData
    )

    ### Step 9 - Compute and aggregate population exposure ###
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

    ### Step 10 - Create alert and submit severity/exposure payloads ###
    # v1 identifier: per-country-per-run using the issued datetime, since no
    # storm-tracking exists yet to name/ID a specific cyclone (see TROPICAL_CYCLONE_PLAN.md
    # Open Items, "Event identity").
    event_name = f"{country}_tropical-cyclone_{_placeholder_issued_datetime()}"

    # v1 placeholder: the country's admin-area centroid, since no vortex-tracker gives
    # a true storm-center fix yet.
    centroid = _placeholder_country_centroid(target_admin_areas)

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

    # No add_geo_feature_exposure for track data in v1 - see TROPICAL_CYCLONE_PLAN.md
    # Open Items (deferred, not a simple reuse; flood's own usage is
    # commented-out/unvalidated).

    data_submitter.add_raster_exposure(
        event_name=event_name,
        layer=Layer.WIND_SPEED,
        value_black_white=raster_to_base64_png(clipped_wind_extent),
        extent=get_raster_extent(clipped_wind_extent),
    )


@dataclass
class _PlaceholderTimeIntervalSeverity:
    """
    Placeholder shape for tropical_cyclone/determine_alerts.py's TimeIntervalSeverity —
    mirrors flood/determine_alerts.py's TimeIntervalSeverity dataclass, renamed for wind
    speed instead of return period. Delete this once determine_alerts.py exists and
    import the real dataclass instead.
    """

    time_interval_start: str
    time_interval_end: str
    median_wind_speed: float
    ensemble_wind_speeds: list[float]


def _placeholder_load_local_gefs_paths(country: str) -> list[str]:
    """
    TODO-infra: replace with DataSource.GEFS_FORECAST once a fetcher exists (see
    TROPICAL_CYCLONE_PLAN.md Batch 5, TODO-infra item 1). Until then, should read local
    GEFS GRIB2 member file paths for `country` (see Batch 3: typhoon/bronze/gefs/).
    Returns an empty list until implemented, which correctly halts the pipeline at the
    Step 4 guard above.
    """
    return []


def _placeholder_extract_wind_speed(
    gefs_member_paths: list[str],
    bounds: BoundingBox,
    basin: Basin,
) -> list:
    """
    TODO(tropical_cyclone/extract_forecast.py):
    extract_wind_speed(gefs_member_paths, bounds, basin) -> list[TimeIntervalWindSpeed].
    Reads GEFS UGRD/VGRD (cfgrib), computes sqrt(u^2+v^2) per member per native 3h step
    to +240h, applies SUSTAINED_WIND_FACTOR[basin], sliced to `bounds`. See
    TROPICAL_CYCLONE_PLAN.md Batch 2 table.
    """
    return []


def _placeholder_determine_alert(
    wind_speeds: list,
    basin: Basin,
    admin_areas: AdminAreasSet,
) -> list[_PlaceholderTimeIntervalSeverity]:
    """
    TODO(tropical_cyclone/determine_alerts.py):
    wind_speed_to_category(speed_ms, basin), determine_alert(...). Per time bucket, must
    compute the per-cell ensemble-median raster FIRST — clipped to the country's own
    admin-area union (the land mask) — then take that raster's max as both the gate
    scalar and the MEDIAN severity value; per-member land-masked max scalars are the RUN
    severity values. See TROPICAL_CYCLONE_PLAN.md Batch 2 "Ensemble aggregation order"
    for why median-first (not max-first) is required.
    """
    return []


def _placeholder_compute_alert_extent(
    time_interval_severities: list[_PlaceholderTimeIntervalSeverity],
    basin: Basin,
) -> RasterData:
    """
    TODO(tropical_cyclone/compute_wind_extent.py):
    compute_alert_extent(time_interval_severities, basin) -> RasterData. Picks the
    qualifying bucket with the highest median wind speed (peak-intensity moment,
    mirrors flood picking the worst return-period day), masks its raster where
    > MIN_SEVERITY_MS[basin]. See TROPICAL_CYCLONE_PLAN.md Batch 2 table.
    """
    raise NotImplementedError(
        "compute_alert_extent placeholder reached with non-empty "
        "time_interval_severities; implement tropical_cyclone/compute_wind_extent.py "
        "before this can run for real."
    )


def _placeholder_determine_spatial_extent(
    wind_extent: RasterData,
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> RasterData | None:
    """
    TODO(tropical_cyclone/determine_exposure.py): determine_spatial_extent(...) - a thin
    wrapper over infra.utils.exposure.clip_raster_to_admin_areas (no per-station
    filtering needed - TC's extent is whole-country). See TROPICAL_CYCLONE_PLAN.md
    Batch 2 table.
    """
    return None


def _placeholder_compute_population_exposed(
    population_raster: RasterData,
    wind_extent_raster: RasterData,
) -> RasterData | None:
    """
    Tropical-cyclone-local stand-in for infra.utils.exposure.compute_population_exposed.
    Plan Batch 2 "Step 0" (moving this out of flood/determine_exposure.py into shared
    infra) is ON HOLD, owned by the flood data scientist — not this hazard's call to
    make. Once it moves: delete this function and replace its one call site above with
    `from pipelines.infra.utils.exposure import compute_population_exposed`.
    """
    return None


def _placeholder_issued_datetime() -> str:
    """Placeholder for the event-name timestamp. See Open Items: 'Event identity'."""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _placeholder_country_centroid(admin_areas: AdminAreasSet) -> Centroid:
    """
    v1 placeholder centroid: the mean of admin-area geometry centroids, since no
    vortex-tracker exists yet to provide a true storm-center fix. See
    TROPICAL_CYCLONE_PLAN.md Open Items, "Track data".
    """
    geometries = [area.to_geometry() for area in admin_areas.admin_areas.values()]
    if not geometries:
        return Centroid(latitude=0.0, longitude=0.0)

    geometry_centroids = [geometry.centroid for geometry in geometries]
    return Centroid(
        latitude=fmean(point.y for point in geometry_centroids),
        longitude=fmean(point.x for point in geometry_centroids),
    )
