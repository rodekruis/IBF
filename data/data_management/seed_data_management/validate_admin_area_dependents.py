"""Report references to admin-area PCODEs that an admin-area update retired.

Rather than checking a hand-maintained list of dependent datasets, this sweeps the
repository and the seed-data repository for any PCODE that existed in the old
admin-area dataset and is gone from the new one. That way datasets nobody remembered
are covered too.
"""

import argparse
import json
import re
import subprocess
import sys
from collections.abc import Callable, Iterator
from pathlib import Path

from data_management.seed_data_management.admin_areas.admin_area_source_config import (
    ADMIN_AREA_LEVELS,
)
from shared.data_helpers import get_seed_data_repo_path

PROCESSED_DIRECTORY = "admin-areas/processed"
DEFAULT_OLD_SEED_REVISION = "origin/main"
REPOSITORY_ROOT = Path("..")

SCAN_ROOTS = [
    REPOSITORY_ROOT / "services/api-service/src",
    REPOSITORY_ROOT / "data/data_management",
    REPOSITORY_ROOT / "data/pipelines",
    REPOSITORY_ROOT / "data/shared",
    REPOSITORY_ROOT / "e2e",
]
SCAN_FILE_SUFFIXES = {".ts", ".py", ".json"}
# "admin-areas" holds the datasets being compared, so it defines the codes rather
# than referencing them. "reference" is fetched from the GO API by fetch_go_data.py
# and follows that source's own admin areas.
EXCLUDED_DIRECTORY_NAMES = {
    "__pycache__",
    "admin-areas",
    "node_modules",
    "output",
    "reference",
    "test-results",
    ".venv",
}
# Short codes such as the adm0 "ET" would match unrelated string literals.
MINIMUM_PLACE_CODE_LENGTH = 4

MAXIMUM_REPORTED_PLACE_CODES = 10
QUOTED_TOKEN_PATTERN = re.compile(r"['\"]([A-Za-z0-9]{2,20})['\"]")

AdminAreaReader = Callable[[str, int], list[dict]]


def main() -> None:
    arguments = parse_arguments()
    new_seed_repo_path = arguments.new_seed_repo or Path(get_seed_data_repo_path())
    retired_place_codes = get_retired_place_codes(
        new_seed_repo_path, arguments.old_seed_revision
    )
    print(
        f"{len(retired_place_codes)} place codes were retired since "
        f"{arguments.old_seed_revision}"
    )

    errors = find_retired_place_code_references(retired_place_codes, new_seed_repo_path)

    for error in errors:
        print(f"ERROR: {error}")

    if errors:
        print(f"\n{len(errors)} file(s) reference retired place codes.")
        sys.exit(1)
    print("\nNo retired place codes referenced.")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--old-seed-revision",
        default=DEFAULT_OLD_SEED_REVISION,
        help="Seed-data revision from before the admin-area update.",
    )
    parser.add_argument(
        "--new-seed-repo",
        type=Path,
        help="Defaults to SEED_DATA_REPO_ROOT.",
    )
    return parser.parse_args()


def get_retired_place_codes(
    new_seed_repo_path: Path, old_seed_revision: str
) -> set[str]:
    old_place_codes = load_place_codes(
        lambda country, level: read_old_admin_area_file(
            new_seed_repo_path, old_seed_revision, country, level
        )
    )
    new_place_codes = load_place_codes(
        lambda country, level: read_admin_area_file(new_seed_repo_path, country, level)
    )
    return old_place_codes - new_place_codes


def load_place_codes(read_admin_areas: AdminAreaReader) -> set[str]:
    place_codes: set[str] = set()
    for country, levels in ADMIN_AREA_LEVELS.items():
        for level in levels:
            features = read_admin_areas(country, level)
            place_codes.update(
                feature["properties"][f"ADM{level}_PCODE"] for feature in features
            )
    return {
        place_code
        for place_code in place_codes
        if len(place_code) >= MINIMUM_PLACE_CODE_LENGTH
    }


def read_admin_area_file(seed_repo_path: Path, country: str, level: int) -> list[dict]:
    filepath = seed_repo_path / get_admin_area_path(country, level)
    if not filepath.exists():
        return []
    with filepath.open(encoding="utf-8") as file:
        return json.load(file)["features"]


# The pre-update files are still in the seed repository's history, so no separate
# checkout of the old dataset is needed.
def read_old_admin_area_file(
    seed_repo_path: Path, revision: str, country: str, level: int
) -> list[dict]:
    try:
        content = subprocess.check_output(
            [
                "git",
                "-C",
                str(seed_repo_path),
                "show",
                f"{revision}:{get_admin_area_path(country, level)}",
            ],
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        return []
    return json.loads(content)["features"]


def get_admin_area_path(country: str, level: int) -> str:
    return f"{PROCESSED_DIRECTORY}/{country}_adm{level}.json"


def find_retired_place_code_references(
    retired_place_codes: set[str], new_seed_repo_path: Path
) -> list[str]:
    errors: list[str] = []
    for filepath in iterate_scanned_files(new_seed_repo_path):
        try:
            source = filepath.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        referenced = set(QUOTED_TOKEN_PATTERN.findall(source)) & retired_place_codes
        if referenced:
            errors.append(f"{filepath}: references {format_place_codes(referenced)}")
    return errors


def iterate_scanned_files(new_seed_repo_path: Path) -> Iterator[Path]:
    for scan_root in [*SCAN_ROOTS, new_seed_repo_path]:
        for filepath in sorted(scan_root.rglob("*")):
            if filepath.suffix not in SCAN_FILE_SUFFIXES:
                continue
            if EXCLUDED_DIRECTORY_NAMES.intersection(filepath.parts):
                continue
            if filepath.is_file():
                yield filepath


def format_place_codes(place_codes: set[str]) -> str:
    sorted_place_codes = sorted(place_codes)
    shown = sorted_place_codes[:MAXIMUM_REPORTED_PLACE_CODES]
    remainder = len(sorted_place_codes) - len(shown)
    suffix = f" and {remainder} more" if remainder else ""
    return f"{len(sorted_place_codes)} place codes ({', '.join(shown)}{suffix})"


if __name__ == "__main__":
    main()
