"""Build per-country flood depth GeoTIFFs for the seed repo from the JRC global river flood hazard maps."""

import argparse
import json
import math
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path

import fiona
import numpy as np
import rasterio
from data_management.seed_data_management.admin_areas.admin_area_dataset_helpers import (
    get_feature_geometry,
    load_admin_features,
)
from rasterio.features import geometry_mask
from rasterio.io import DatasetReader
from rasterio.merge import merge
from rasterio.profiles import Profile
from shapely import union_all
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry
from shared.data_helpers import get_seed_data_repo_path, target_countries_iso_a3
from shared.download_helpers import download_object

# When rebuilding from a new version, also update the flood hazard maps entry in api-service FORECAST_SOURCE_DETAILS.
JRC_FLOOD_HAZARD_URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-GLOFAS/flood_hazard"
)
TILE_EXTENTS_FILENAME = "tile_extents.geojson"
HYDROLAKES_URL = (
    "https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10.gdb.zip"
)
HYDROLAKES_LAYER_PATH = "HydroLAKES_polys_v10.gdb"
DEFAULT_RETURN_PERIODS = [10, 20, 50, 75, 100, 200, 500]
DEFAULT_CACHE_DIRECTORY = (
    Path(__file__).parents[3] / "data" / "flood-depth-sources-cache"
)
SOURCES_TIF_DIRECTORY = Path("hazard/flood/flood-extents/sources-tif")
NODATA = -9999.0

Bounds = tuple[float, float, float, float]


@dataclass(frozen=True)
class Tile:
    identifier: int
    name: str
    geometry: BaseGeometry

    @property
    def filename_prefix(self) -> str:
        return f"ID{self.identifier}_{self.name}"


def main() -> None:
    arguments = parse_arguments()
    seed_repo_path = get_seed_data_repo_path()
    output_directory: Path = (
        arguments.output_directory or seed_repo_path / SOURCES_TIF_DIRECTORY
    )
    output_directory.mkdir(parents=True, exist_ok=True)
    tile_cache_directory = arguments.cache_directory / "jrc"
    tiles = load_tiles(tile_cache_directory)
    lakes_path = download_file(
        HYDROLAKES_URL,
        arguments.cache_directory / "hydrolakes" / Path(HYDROLAKES_URL).name,
    )

    for country in arguments.countries:
        build_country_flood_depths(
            seed_repo_path=seed_repo_path,
            country=country,
            return_periods=arguments.return_periods,
            tiles=tiles,
            tile_cache_directory=tile_cache_directory,
            lakes_path=lakes_path,
            output_directory=output_directory,
        )


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--countries", nargs="+", default=sorted(target_countries_iso_a3)
    )
    parser.add_argument(
        "--return-periods", nargs="+", type=int, default=DEFAULT_RETURN_PERIODS
    )
    parser.add_argument("--cache-directory", type=Path, default=DEFAULT_CACHE_DIRECTORY)
    parser.add_argument(
        "--output-directory",
        type=Path,
        help="Defaults to sources-tif in the seed repo",
    )
    return parser.parse_args()


def load_tiles(tile_cache_directory: Path) -> list[Tile]:
    tile_extents_path = download_jrc_file(TILE_EXTENTS_FILENAME, tile_cache_directory)
    features = json.loads(tile_extents_path.read_text(encoding="utf-8"))["features"]
    return [
        Tile(
            identifier=feature["properties"]["id"],
            name=feature["properties"]["name"],
            geometry=shape(feature["geometry"]),
        )
        for feature in features
    ]


def build_country_flood_depths(
    seed_repo_path: Path,
    country: str,
    return_periods: list[int],
    tiles: list[Tile],
    tile_cache_directory: Path,
    lakes_path: Path,
    output_directory: Path,
) -> None:
    country_bounds = get_country_bounds(seed_repo_path, country)
    country_tiles = [
        tile for tile in tiles if tile.geometry.intersects(box(*country_bounds))
    ]
    lake_geometries = load_lake_geometries(lakes_path, country_bounds)
    print(f"{country}: {len(country_tiles)} tiles, {len(lake_geometries)} lakes")

    written_paths: set[Path] = set()
    for return_period in return_periods:
        depth_paths = [
            download_jrc_file(
                f"RP{return_period}/{tile.filename_prefix}_RP{return_period}_depth.tif",
                tile_cache_directory,
            )
            for tile in country_tiles
        ]
        depth, profile = merge_tiles(depth_paths, country_bounds)
        mask_lakes(depth, profile, lake_geometries)
        output_path = output_directory / f"{country}_flood_extent_rp{return_period}.tif"
        write_flood_depth(depth, profile, output_path)
        written_paths.add(output_path)

    remove_stale_flood_depths(output_directory, country, written_paths)


def remove_stale_flood_depths(
    output_directory: Path, country: str, written_paths: set[Path]
) -> None:
    for path in output_directory.glob(f"{country}_flood_extent_rp*.tif"):
        if path not in written_paths:
            path.unlink()
            print(f"  removed stale {path.name}")


def get_country_bounds(seed_repo_path: Path, country: str) -> Bounds:
    features = load_admin_features(seed_repo_path, country, level=0)
    return union_all([get_feature_geometry(feature) for feature in features]).bounds


def load_lake_geometries(lakes_path: Path, bounds: Bounds) -> list[BaseGeometry]:
    with fiona.open(f"zip://{lakes_path}!{HYDROLAKES_LAYER_PATH}") as lakes:
        return [shape(lake.geometry) for lake in lakes.filter(bbox=bounds)]


def download_jrc_file(relative_path: str, cache_directory: Path) -> Path:
    return download_file(
        f"{JRC_FLOOD_HAZARD_URL}/{relative_path}", cache_directory / relative_path
    )


def download_file(url: str, path: Path) -> Path:
    if path.exists():
        return path

    content = download_object(url)
    if content is None:
        raise RuntimeError(f"Could not download '{url}'")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def merge_tiles(tile_paths: list[Path], bounds: Bounds) -> tuple[np.ndarray, Profile]:
    with ExitStack() as stack:
        datasets = [stack.enter_context(rasterio.open(path)) for path in tile_paths]
        mosaic, transform = merge(
            datasets, bounds=align_bounds_to_grid(bounds, datasets[0])
        )
        profile = datasets[0].profile
    profile.update(height=mosaic.shape[1], width=mosaic.shape[2], transform=transform)
    return mosaic[0], profile


def align_bounds_to_grid(bounds: Bounds, dataset: DatasetReader) -> Bounds:
    minimum_x, minimum_y, maximum_x, maximum_y = bounds
    resolution_x, resolution_y = dataset.res
    origin_x, origin_y = dataset.transform.c, dataset.transform.f
    return (
        origin_x + math.floor((minimum_x - origin_x) / resolution_x) * resolution_x,
        origin_y - math.ceil((origin_y - minimum_y) / resolution_y) * resolution_y,
        origin_x + math.ceil((maximum_x - origin_x) / resolution_x) * resolution_x,
        origin_y - math.floor((origin_y - maximum_y) / resolution_y) * resolution_y,
    )


def mask_lakes(
    depth: np.ndarray, profile: Profile, lake_geometries: list[BaseGeometry]
) -> None:
    if not lake_geometries:
        return
    is_lake = geometry_mask(
        lake_geometries,
        out_shape=depth.shape,
        transform=profile["transform"],
        invert=True,
    )
    depth[is_lake] = NODATA


def write_flood_depth(depth: np.ndarray, profile: Profile, path: Path) -> None:
    profile.update(dtype=rasterio.float32, count=1, nodata=NODATA, compress="lzw")
    with rasterio.open(path, "w", **profile) as destination:
        destination.write(depth.astype(np.float32), 1)
    print(f"  {path.name}: {np.count_nonzero(depth > 0)} flooded cells")


if __name__ == "__main__":
    main()
