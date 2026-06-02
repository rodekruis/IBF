from __future__ import annotations

import logging
import os

import xarray as xr
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.loaded_data_types import RasterData

BoundingBox = tuple[float, float, float, float]  # (min_lon, min_lat, max_lon, max_lat)


def get_bounding_box(admin_areas: AdminAreasSet) -> BoundingBox:
    """Compute (min_lon, min_lat, max_lon, max_lat) from admin area geometries."""
    from shapely.geometry import shape

    min_lon = float("inf")
    min_lat = float("inf")
    max_lon = float("-inf")
    max_lat = float("-inf")

    for admin_area in admin_areas.admin_areas.values():
        geom = shape(
            {
                "type": admin_area.geometry_type,
                "coordinates": admin_area.coordinates,
            }
        )
        bounds = geom.bounds  # (minx, miny, maxx, maxy)
        min_lon = min(min_lon, bounds[0])
        min_lat = min(min_lat, bounds[1])
        max_lon = max(max_lon, bounds[2])
        max_lat = max(max_lat, bounds[3])

    return (min_lon, min_lat, max_lon, max_lat)


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
