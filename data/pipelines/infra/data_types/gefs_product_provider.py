"""
Download tropical-cyclone GEFS fixtures (per-member wind GRIB2 and cyclone-track ATCF)
from the seed-data repo, for locally testing the tropical-cyclone pipeline end to end.
"""

from __future__ import annotations

import logging
import os
from enum import StrEnum

from pipelines.infra.utils.nrw_logger import log_info, LogTag
from pipelines.infra.utils.storage_helpers import get_tropical_cyclone_mock_data_dir
from shared.download_helpers import download_json_source, download_object

logger = logging.getLogger(__name__)

SEED_REPO_TROPICAL_CYCLONE_PATH = "/mock-forecasts/tropical-cyclone/"


class GefsProduct(StrEnum):
    """A GEFS product's seed-repo subdirectory and cache namespace."""

    WIND = "gefs-wind"
    TRACK = "gefs-track"


def download_gefs_product_from_seed_repo(
    country: str, product: GefsProduct, mock_variant: str
) -> list[str]:
    """
    Download one GEFS product's cycle from the seed repo and return the local file paths.

    `product` is both the seed-repo subdirectory and the cache namespace:
    `GefsProduct.WIND` (per-member GRIB2) or `GefsProduct.TRACK` (ATCF track files)
    `mock_variant` selects the scenario manifest: `alert` or `no-alert`
    """
    base_url = os.environ.get("GITHUB_DATA_BASE_URL")
    if not base_url:
        raise ValueError(
            "GITHUB_DATA_BASE_URL environment variable is required "
            "for loading GEFS fixtures from the seed repo."
        )

    product_base_url = f"{base_url}{SEED_REPO_TROPICAL_CYCLONE_PATH}{country}/{product}"
    manifest_url = f"{product_base_url}/manifest.{mock_variant}.json"

    manifest = download_json_source(manifest_url, check_count=False)
    if manifest is None:
        raise FileNotFoundError(
            f"Failed to download GEFS manifest from '{manifest_url}'"
        )

    relative_paths = manifest.get("files", [])
    if not relative_paths:
        raise ValueError(f"GEFS manifest '{manifest_url}' lists no files")

    cache_dir = get_tropical_cyclone_mock_data_dir(country, product)
    local_paths: list[str] = []
    for relative_path in relative_paths:
        local_path = os.path.join(cache_dir, *relative_path.split("/"))
        if not _is_cached(local_path):
            _download_to_cache(f"{product_base_url}/{relative_path}", local_path)
        local_paths.append(local_path)

    log_info(
        logger,
        LogTag.INFRA,
        f"Loaded {len(local_paths)} GEFS '{product}' files (cache: {cache_dir})",
    )
    return sorted(local_paths)


def _is_cached(local_path: str) -> bool:
    return os.path.isfile(local_path) and os.path.getsize(local_path) > 0


def _download_to_cache(url: str, local_path: str) -> None:
    content = download_object(url)
    if content is None:
        raise FileNotFoundError(f"Failed to download GEFS file from '{url}'")
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as file:
        file.write(content)
