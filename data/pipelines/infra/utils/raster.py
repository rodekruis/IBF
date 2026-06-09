from __future__ import annotations

import base64
import io
import logging
import os

import numpy as np
import xarray as xr
from PIL import Image
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.data_types.location_point import LocationPoint

BoundingBox = tuple[float, float, float, float]  # (min_lon, min_lat, max_lon, max_lat)


def get_bounding_box(
    admin_areas: AdminAreasSet,
    point_locations: dict[str, LocationPoint] | None = None,
) -> BoundingBox:
    """Compute (min_lon, min_lat, max_lon, max_lat) from admin area geometries and optionally point locations."""
    from shapely.geometry import MultiPoint
    from shapely.ops import unary_union

    geoms = [a.to_geometry() for a in admin_areas.admin_areas.values()]

    if point_locations:
        geoms.append(
            MultiPoint([(float(p.lon), float(p.lat)) for p in point_locations.values()])
        )

    return unary_union(geoms).bounds


def slice_netcdf_to_bounds(
    input_path: str,
    bounds: BoundingBox,
    output_path: str | None = None,
) -> str:
    """Slice a global NetCDF file to the given bounding box.

    Returns the path to the sliced file. If output_path is None, a temporary
    file is created in the same directory as the input file.
    """
    min_lon, min_lat, max_lon, max_lat = bounds

    with xr.open_dataset(input_path) as nc_file:
        sliced = nc_file.sel(
            lon=slice(min_lon, max_lon),
            lat=slice(max_lat, min_lat),
        )

        try:
            if output_path is None:
                directory = os.path.dirname(input_path)
                basename = os.path.splitext(os.path.basename(input_path))[0]
                output_path = os.path.join(directory, f"{basename}_sliced.nc")

            sliced.to_netcdf(output_path)
        finally:
            sliced.close()

    logging.info(f"Sliced NetCDF {input_path} to bounds {bounds} -> {output_path}")
    return output_path


def get_raster_extent(raster: RasterData) -> dict[str, float]:
    """Return raster bounds as an extent dict expected by the API layer."""
    t = raster.transform
    rows, cols = raster.array.shape
    corners = [
        t * (0, 0),
        t * (cols, 0),
        t * (0, rows),
        t * (cols, rows),
    ]
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    return {
        "xmin": min(xs),
        "ymin": min(ys),
        "xmax": max(xs),
        "ymax": max(ys),
    }


def raster_to_base64_png(raster: RasterData) -> str:
    array = raster.array.copy()
    array = np.where(np.isnan(array), 0, array)
    array = np.clip(array, 0, None)

    max_val = array.max()
    if max_val > 0:
        normalized = (array / max_val * 255).astype(np.uint8)
    else:
        normalized = array.astype(np.uint8)

    img = Image.fromarray(normalized, mode="L")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")
