from __future__ import annotations

import logging

import numpy as np
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import AlertConfig, RasterData
from pipelines.infra.utils.nrw_logger import log_warning, LogTag
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import Affine, from_bounds
from rasterio.warp import reproject
from rasterio.windows import from_bounds as window_from_bounds
from rasterstats import zonal_stats

logger = logging.getLogger(__name__)


def aggregate_population_exposed(
    population_exposed_raster: RasterData,
    place_codes_exposed: list[str],
    admin_areas: AdminAreasSet,
) -> dict[str, float]:
    """
    Aggregate population exposed within the flood extent per place code.
    """

    population: dict[str, float] = {}

    geometries, pcodes_ordered = get_admin_area_geometries(
        place_codes=place_codes_exposed,
        admin_areas=admin_areas,
    )

    if not geometries:
        return population

    stats = zonal_stats(
        geometries,
        population_exposed_raster.array,
        affine=population_exposed_raster.transform,
        stats=["sum"],
        all_touched=False,
        nodata=population_exposed_raster.nodata,
    )

    for pcode, stat in zip(pcodes_ordered, stats):
        value = stat.get("sum")
        population[pcode] = round(value, 0) if value is not None else 0.0

    return population


def compute_population_exposed(
    population_raster: RasterData,
    hazard_extent_raster: RasterData,
) -> RasterData | None:
    """
    Masks the population raster with the (binary) hazard extent raster
    so only exposed pixels count toward the population sum.
    Returns the exposed population as in-memory raster data.
    """
    if (
        population_raster is None
        or hazard_extent_raster is None
        or population_raster.array.size == 0
        or hazard_extent_raster.array.size == 0
    ):
        return None

    pop_array = population_raster.array
    pop_transform = population_raster.transform
    pop_crs = population_raster.crs

    cropped_pop_array, cropped_pop_transform = _crop_to_hazard_bounds(
        pop_array, pop_transform, hazard_extent_raster, pop_crs
    )

    hazard_array_resampled = np.zeros(cropped_pop_array.shape, dtype=np.float32)
    reproject(
        source=hazard_extent_raster.array.astype(np.float32),
        destination=hazard_array_resampled,
        src_transform=hazard_extent_raster.transform,
        src_crs=hazard_extent_raster.crs,
        dst_transform=cropped_pop_transform,
        dst_crs=pop_crs,
        resampling=Resampling.nearest,
    )

    binary_hazard_extent = (hazard_array_resampled > 0).astype(np.uint8)
    population_in_hazard_extent = np.where(
        binary_hazard_extent == 1, cropped_pop_array, 0.0
    )

    return RasterData(
        array=population_in_hazard_extent.astype(np.float32),
        transform=cropped_pop_transform,
        crs=pop_crs,
        nodata=population_raster.nodata,
    )


def _crop_to_hazard_bounds(
    pop_array: np.ndarray,
    pop_transform: Affine,
    hazard_extent_raster: RasterData,
    pop_crs: str,
) -> tuple[np.ndarray, Affine]:
    """
    Crop the population array to the bounding box of the hazard extent raster.
    Returns the cropped array and its new transform. Falls back to the full array
    if the window is invalid or empty.
    """
    if hazard_extent_raster.crs != pop_crs:
        return pop_array, pop_transform

    hazard_t = hazard_extent_raster.transform
    hazard_rows, hazard_cols = hazard_extent_raster.array.shape
    hazard_corners = [
        hazard_t * (0, 0),
        hazard_t * (hazard_cols, 0),
        hazard_t * (0, hazard_rows),
        hazard_t * (hazard_cols, hazard_rows),
    ]
    min_x = min(c[0] for c in hazard_corners)
    max_x = max(c[0] for c in hazard_corners)
    min_y = min(c[1] for c in hazard_corners)
    max_y = max(c[1] for c in hazard_corners)

    window = window_from_bounds(min_x, min_y, max_x, max_y, pop_transform)
    row_start = max(int(np.floor(window.row_off)), 0)
    col_start = max(int(np.floor(window.col_off)), 0)
    row_end = min(int(np.ceil(window.row_off + window.height)), pop_array.shape[0])
    col_end = min(int(np.ceil(window.col_off + window.width)), pop_array.shape[1])

    if row_end <= row_start or col_end <= col_start:
        return pop_array, pop_transform

    cropped = pop_array[row_start:row_end, col_start:col_end]
    cropped_transform = pop_transform * Affine.translation(col_start, row_start)
    return cropped, cropped_transform


def clip_raster_to_admin_areas(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
    raster: RasterData,
    label: str = "",
) -> RasterData:
    """Clip a raster to the union of admin area geometries for the given place codes."""
    geometries, _ = get_admin_area_geometries(
        place_codes=place_codes,
        admin_areas=admin_areas,
    )

    if not geometries:
        log_warning(
            logger,
            LogTag.INFRA,
            f"No admin area geometries to clip{f' for {label}' if label else ''}; using full raster",
        )
        return raster

    combined_geom = admin_areas.admin_areas[place_codes[0]].to_geometry()
    for pcode in place_codes[1:]:
        area = admin_areas.admin_areas.get(pcode)
        if area:
            combined_geom = combined_geom.union(area.to_geometry())

    minx, miny, maxx, maxy = combined_geom.bounds
    window = window_from_bounds(minx, miny, maxx, maxy, raster.transform)
    row_off = max(int(np.floor(window.row_off)), 0)
    col_off = max(int(np.floor(window.col_off)), 0)
    row_end = min(int(np.ceil(window.row_off + window.height)), raster.array.shape[0])
    col_end = min(int(np.ceil(window.col_off + window.width)), raster.array.shape[1])

    cropped_array = raster.array[row_off:row_end, col_off:col_end]
    t = raster.transform
    cropped_transform = from_bounds(
        t.c + col_off * t.a,
        t.f + row_end * t.e,
        t.c + col_end * t.a,
        t.f + row_off * t.e,
        col_end - col_off,
        row_end - row_off,
    )

    mask_array = geometry_mask(
        geometries,
        out_shape=cropped_array.shape,
        transform=cropped_transform,
        invert=True,
    )

    nodata = raster.nodata
    clipped = np.where(mask_array, cropped_array, nodata)

    return RasterData(
        array=clipped.astype(np.float32),
        transform=cropped_transform,
        crs=raster.crs,
        nodata=nodata,
    )


def get_admin_area_geometries(
    place_codes: list[str],
    admin_areas: AdminAreasSet,
) -> tuple[list[dict], list[str]]:
    geometries: list[dict] = []
    place_codes_ordered: list[str] = []

    for place_code in place_codes:
        admin_area = admin_areas.admin_areas.get(place_code)
        if admin_area is None:
            continue
        geometries.append(
            {
                "type": admin_area.geometry_type,
                "coordinates": admin_area.coordinates,
            }
        )
        place_codes_ordered.append(place_code)

    return geometries, place_codes_ordered


def get_place_codes_for_alert_config(
    config: AlertConfig,
    admin_areas: AdminAreasSet,
    target_admin_level: int,
) -> list[str]:
    """Return place codes for an alert config's spatial extent.
    If the config specifies explicit place codes, those are returned.
    Otherwise returns all admin areas at the target admin level."""
    if config.spatial_extent_place_codes:
        return config.spatial_extent_place_codes
    return [
        pcode
        for pcode, area in admin_areas.admin_areas.items()
        if area.properties.admin_level == target_admin_level
    ]
