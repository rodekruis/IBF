"""
Helper functions relating to image processing
"""

import io

import numpy as np
import rasterio
import rasterio.crs
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.transform import array_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling

CRS = rasterio.crs.CRS


def colorize_image_from_file(
    png_in_bytes: bytes, color1: tuple, color2: tuple, log_scale: bool
):
    """
    Wrapper for colorize_image_array that takes in PNG bytes instead of an array.
    """
    img = Image.open(io.BytesIO(png_in_bytes))
    img_bw = np.array(img, dtype=np.float32)
    return colorize_image_array(img_bw, color1, color2, log_scale)


def colorize_image_array(
    img_bw: np.ndarray, color1: tuple, color2: tuple, log_scale: bool
):
    """
    Colorize a grayscale image between two colors.
    log_scale: whether or not to convert to a logarithmic scale.
    """

    # optional: convert the data to logarithmic scale
    if log_scale:
        # np.log1p performs log(1 + x)
        # Since PNG values are non-negative, np.log1p will also return non-negative values
        img_bw = np.log1p(img_bw)

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
                n = normalized[i, j]
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
                resampling=Resampling.bilinear,
            )

            # Calculate the new bounds in 3857
            new_bounds = array_bounds(height, width, transform)

            # Get meta data
            geo_data = {
                "width": width,
                "height": height,
                "count": src.count,
                "crs": str(target_crs),
                "transform": list(transform),
                "bounds": {
                    "left": new_bounds[0],
                    "bottom": new_bounds[1],
                    "right": new_bounds[2],
                    "top": new_bounds[3],
                },
                "res": (transform[0], -transform[4]),
                "scales": src.scales,
                "offsets": src.offsets,
            }

            # If NoData values are above 0, set it to a large negative number (-999)
            # This way it can be set to 0 later, and actual data values of 0 are preserved
            if src.nodata is not None and src.nodata > 0:
                print(
                    f"Warning: This file has a NoData value greater than 0. "
                    f"This should be handled fine, but verify results. NoData value: {src.nodata}."
                )
                # replace all noData values with a large negative number (-999)
                reproj_data = np.where(reproj_data == src.nodata, -999, reproj_data)
                src.nodata = -999

            # Normalize data to 0-254 (if it has values above 0)
            # 0-254 is used, since 1 is added later (bringing the max to 255)
            # in order to offset data from the NoData value of 0.
            if reproj_data.max() > 0:
                norm_data = (reproj_data.astype(float) / reproj_data.max()) * 254
            else:
                norm_data = reproj_data.astype(float)

            # Set 0 as the new nodata value, and make other data start at 1
            norm_data = np.where(norm_data < 0, 0, norm_data + 1)

            # cast to uint8 for PNG output
            img_array_bw = norm_data.astype(np.uint8)
            return geo_data, img_array_bw


def geotiff_to_rgb_data_array(tif_data: bytes):
    """
    Convert a GeoTIFF to an RGB int array, without changing the projection.
    This is used to convert GeoTIFFs to PNG while preserving the data range as best as possible.

    Population values are encoded across the R, G, B channels,
    allowing for a per pixel range of 256^3 (over 16 million per pixel)
    The value can be decoded with: value = R * 65536 + G * 256 + B
    Also returns metadata from the original GeoTIFF.

    Note: This conversion also does this to the data (due to PNG limitations):
      - NoData values are set to 0
      - Values are clamped between 0 and about 16.8 million (max encoding value)
      - All values are rounded to integers

      If higher numbers are needed, change this to use RGBA for the value encoding.
    """
    with MemoryFile(tif_data) as memfile:
        with memfile.open() as src:
            raw_data = src.read(1)

            geo_data = {
                "width": src.width,
                "height": src.height,
                "count": src.count,
                "crs": str(src.crs),
                "transform": list(src.transform),
                "bounds": {
                    "left": src.bounds.left,
                    "bottom": src.bounds.bottom,
                    "right": src.bounds.right,
                    "top": src.bounds.top,
                },
                "res": src.res,
                "scales": src.scales,
                "offsets": src.offsets,
                "nodata": 0,  # NoData values are set to 0 with the conversion
                "dtype": str(src.dtypes[0]),
            }

            # Replace nodata with 0
            if src.nodata is not None:
                raw_data = np.where(raw_data == src.nodata, 0, raw_data)

            # Clamp negatives to 0 and round to integer
            values = np.clip(raw_data, 0, None).astype(np.uint32)

            # Get max value and warn if any values go beyond the encoding max
            max_value = int(values.max())
            if max_value > 256**3 - 1:
                print(
                    f"Warning: max value {max_value} exceeds RGB encoding capacity "
                    f"({256**3 - 1}). Values will be clipped."
                )
                values = np.clip(values, 0, 256**3 - 1)

            # Update the max value in the meta data
            geo_data["max_value"] = max_value

            # Encode value into R, G, B channels
            # This works by shifting bits by 2, 1, or 0 bytes,
            # and then grabbing the last byte.
            # It's like taking EF9A2F and splitting it into EF 9A 2F
            # The value can be decoded with: R*65536 + G*256 + B
            r = ((values >> 16) & 0xFF).astype(np.uint8)
            g = ((values >> 8) & 0xFF).astype(np.uint8)
            b = (values & 0xFF).astype(np.uint8)

            # Place into an RGB array
            rgb_array = np.dstack([r, g, b])
            return geo_data, rgb_array
