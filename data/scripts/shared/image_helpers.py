"""
Helper functions relating to image processing
"""

import io
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.transform import array_bounds
import rasterio.crs
import numpy as np
from PIL import Image
CRS = rasterio.crs.CRS

def colorize_image_array(img_array: bytes, color1 : tuple, color2: tuple, log_scale : bool):
    """
    Colorize a grayscale image between two colors.
    log_scale: whether or not to convert to a logarithmic scale.
    """

    img = Image.open(io.BytesIO(img_array))
    img_bw = np.array(img, dtype=np.float32)

    # optional: convert the data to logarithmic scale
    if log_scale:
        img_bw = np.log1p(img_bw)
        # Since values under 1 will be negative now, set these to 0
        img_bw[img_bw < 0] = 0  # log(1 + x) to handle zero values

    # Normalize to 0-1 range for color interpolation
    img_max = np.nanmax(img_bw)
    if img_max == 0:
        img_max = 1  # prevent division by zero
    normalized = img_bw / img_max

    # Create RGBA array - lerp between color1 and color2
    height, width = img_bw.shape
    img_array_rgba = np.zeros((height, width, 4), dtype=np.uint8)

    # Set alpha to 0 for pixels with values less than 1, else lerp between the two colors
    for i in range(height):
        for j in range(width):
            if img_bw[i, j] == 0:
                img_array_rgba[i, j] = [0, 0, 0, 0]
            else:
                # lerp between color1 and 2 based on the normalized value from the greyscale array
                n  = normalized[i, j]
                img_array_rgba[i, j, 0] = int(color1[0] * (1 - n) + color2[0] * n)
                img_array_rgba[i, j, 1] = int(color1[1] * (1 - n) + color2[1] * n)
                img_array_rgba[i, j, 2] = int(color1[2] * (1 - n) + color2[2] * n)
                img_array_rgba[i, j, 3] = int(color1[3] * (1 - n) + color2[3] * n)

    return img_array_rgba


def geotiff_to_array(tif_data: bytes):
    """
    Convert a GeoTIFF to EPSG:3857, and return it as an array that is formatted to easily be written to a grayscale PNG.
    Metadata is also returned.
    """
    # Open the GeoTIFF from binary data
    with MemoryFile(tif_data) as memfile:
        with memfile.open() as src:
            # Reproject to EPSG:3857
            target_crs = CRS.from_epsg(3857)
            transform, width, height = calculate_default_transform(
                src.crs, target_crs, src.width, src.height, *src.bounds
            )

            reproj_data = np.empty((height, width), dtype=src.dtypes[0])

            reproject(
                source=rasterio.band(src, 1),
                destination=reproj_data,
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=transform,
                dst_crs=target_crs,
                resampling=Resampling.bilinear
            )

            # Calculate the new bounds in 3857
            new_bounds = array_bounds(height, width, transform)

            # Get meta data
            geo_data = {
                'width': width,
                'height': height,
                'count': src.count,
                'crs': str(target_crs),
                'transform': list(transform),
                'bounds': {
                    'left': new_bounds[0],
                    'bottom': new_bounds[1],
                    'right': new_bounds[2],
                    'top': new_bounds[3]
                },
                'res': (transform[0], -transform[4]),
                'scales': src.scales,
                'offsets': src.offsets
            }

            # This script only supports NoData values of zero or less
            if src.nodata is not None and src.nodata > 0:
                print(f"Error: Only NoData values of 0 or less are supported. NoData value: {src.nodata}.")

            # Normalize data to 0-255
            norm_data = (reproj_data / reproj_data.max()) * 255

            # Set 0 as the new nodata value, and make other data start at 1
            for i in range(norm_data.shape[0]):
                for j in range(norm_data.shape[1]):
                    if norm_data[i, j] < 0:
                        norm_data[i, j] = 0
                    else:
                        norm_data[i, j] += 1

            # cast to uint8 for PNG output
            img_array_bw = norm_data.astype(np.uint8)
            return geo_data, img_array_bw