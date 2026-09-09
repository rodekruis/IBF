"""Shared helpers for migrating admin-area-keyed seed data onto a new admin-area dataset."""

import json
import subprocess
from pathlib import Path
from typing import cast

from shapely import union_all
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid

ADMIN_AREAS_DIRECTORY = Path("admin-areas/processed")
DEFAULT_SEED_REPOSITORY_URL = "https://github.com/rodekruis/IBF-seed-data.git"


def load_json(filepath: Path) -> dict | list:
    with filepath.open(encoding="utf-8") as file:
        return json.load(file)


def load_admin_features(seed_repo_path: Path, country: str, level: int) -> list[dict]:
    filepath = seed_repo_path / ADMIN_AREAS_DIRECTORY / f"{country}_adm{level}.json"
    return cast(dict, load_json(filepath))["features"]


def get_feature_geometry(feature: dict) -> BaseGeometry:
    return make_valid(shape(feature["geometry"]))


def get_pcode(feature: dict, level: int) -> str:
    return feature["properties"][f"ADM{level}_PCODE"]


def get_area_name(feature: dict, level: int) -> str | None:
    return feature["properties"].get(f"ADM{level}_EN")


def union_geometries(geometries: list[BaseGeometry]) -> BaseGeometry | None:
    if not geometries:
        return None
    return union_all(geometries)


def get_git_revision(repository_path: Path) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(repository_path), "rev-parse", "HEAD"],
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        return None
