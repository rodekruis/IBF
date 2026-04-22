from __future__ import annotations

import logging
import os
import tempfile

import rasterio
import xarray as xr
from rasterio.windows import from_bounds

from pipelines.infra.data_types.admin_area_types import AdminAreasSet

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

    nc_file = xr.open_dataset(input_path)
    sliced = nc_file.sel(
        lon=slice(min_lon, max_lon),
        lat=slice(max_lat, min_lat),
    )

    if output_path is None:
        directory = os.path.dirname(input_path)
        basename = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(directory, f"{basename}_sliced.nc")

    sliced.to_netcdf(output_path)
    nc_file.close()

    logging.info(f"Sliced NetCDF {input_path} to bounds {bounds} -> {output_path}")
    return output_path


def clip_raster_to_bounds(
    input_path: str,
    bounds: BoundingBox,
    output_path: str | None = None,
) -> str:
    """Clip a GeoTIFF to the given bounding box using a rasterio window.

    Returns the path to the clipped file. If output_path is None, a temporary
    file is created in the same directory as the input file.
    """
    min_lon, min_lat, max_lon, max_lat = bounds

    with rasterio.open(input_path) as src:
        window = from_bounds(min_lon, min_lat, max_lon, max_lat, src.transform)
        transform = src.window_transform(window)
        data = src.read(window=window)

        profile = src.profile.copy()
        profile.update(
            width=data.shape[2],
            height=data.shape[1],
            transform=transform,
        )

        if output_path is None:
            directory = os.path.dirname(input_path)
            basename = os.path.splitext(os.path.basename(input_path))[0]
            output_path = os.path.join(directory, f"{basename}_clipped.tif")

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(data)

    logging.info(f"Clipped raster {input_path} to bounds {bounds} -> {output_path}")
    return output_path


def get_raster_extent(raster_path: str) -> dict[str, float]:
    """Return raster bounds as an extent dict expected by the API layer."""
    with rasterio.open(raster_path) as src:
        bounds = src.bounds

    return {
        "xmin": bounds.left,
        "ymin": bounds.bottom,
        "xmax": bounds.right,
        "ymax": bounds.top,
    }
