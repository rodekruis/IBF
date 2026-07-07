from __future__ import annotations

import os
from pathlib import Path

import pytest

from pipelines.infra.data_types.glofas_discharge_provider import (
    _validate_ensemble_count,
    GLOFAS_MIN_ENSEMBLE_COUNT,
    load_glofas_discharge_from_cache,
)
from pipelines.infra.utils.storage_helpers import (
    find_latest_forecast_date_in_cache,
    get_cached_glofas_files,
    get_glofas_raw_data_dir,
    GLOFAS_RAW_DATA_DIR,
)

FORECAST_DATE = "20260326"


def _write_cached_files(
    cache_base: Path,
    forecast_date: str,
    count: int,
) -> list[str]:
    """Create `count` non-empty NetCDF cache files for `forecast_date`."""
    cache_dir = cache_base / GLOFAS_RAW_DATA_DIR / forecast_date
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for ensemble_index in range(count):
        path = cache_dir / f"dis_{ensemble_index:02d}_{forecast_date}00.nc"
        # Write content to the file since empty files are ignored.
        path.write_bytes(b"fake_NetCDF_content")
        paths.append(str(path))
    return sorted(paths)


# ---------------------------------------------------------------------------
# _validate_ensemble_count (GLOFAS_MIN_ENSEMBLE_COUNT logic)
# ---------------------------------------------------------------------------


def test_validate_ensemble_count_passes_at_minimum() -> None:
    files = [f"dis_{i:02d}.nc" for i in range(GLOFAS_MIN_ENSEMBLE_COUNT)]
    # Should not raise.
    _validate_ensemble_count(files, FORECAST_DATE)


def test_validate_ensemble_count_passes_above_minimum() -> None:
    files = [f"dis_{i:02d}.nc" for i in range(GLOFAS_MIN_ENSEMBLE_COUNT + 5)]
    _validate_ensemble_count(files, FORECAST_DATE)


def test_validate_ensemble_count_raises_below_minimum() -> None:
    files = [f"dis_{i:02d}.nc" for i in range(GLOFAS_MIN_ENSEMBLE_COUNT - 1)]
    with pytest.raises(ValueError, match="Insufficient GloFAS ensemble files"):
        _validate_ensemble_count(files, FORECAST_DATE)


def test_validate_ensemble_count_raises_on_empty() -> None:
    with pytest.raises(ValueError, match="Insufficient GloFAS ensemble files"):
        _validate_ensemble_count([], FORECAST_DATE)


# ---------------------------------------------------------------------------
# get_cached_glofas_files (date-keyed cache reuse)
# ---------------------------------------------------------------------------


def test_cached_files_returned_when_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    expected = _write_cached_files(tmp_path, FORECAST_DATE, count=51)

    result = get_cached_glofas_files(FORECAST_DATE)

    assert result == expected


def test_cached_empty_files_removed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    expected = _write_cached_files(tmp_path, FORECAST_DATE, count=51)
    # An incomplete/failed download leaves a zero-byte file that must be pruned.
    cache_dir = tmp_path / GLOFAS_RAW_DATA_DIR / FORECAST_DATE
    empty_file = cache_dir / f"dis_51_{FORECAST_DATE}00.nc"
    empty_file.write_bytes(b"")

    result = get_cached_glofas_files(FORECAST_DATE)

    assert result == expected
    assert not empty_file.exists()


def test_cached_files_none_when_dir_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))

    result = get_cached_glofas_files(FORECAST_DATE)

    assert result is None


def test_cached_files_none_when_no_netcdf_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    cache_dir = tmp_path / GLOFAS_RAW_DATA_DIR / FORECAST_DATE
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "not-a-netcdf.txt").write_bytes(b"")

    result = get_cached_glofas_files(FORECAST_DATE)

    assert result is None


def test_cached_files_none_when_cache_dir_env_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATA_CACHE_DIR", raising=False)

    result = get_cached_glofas_files(FORECAST_DATE)

    assert result is None


# ---------------------------------------------------------------------------
# get_glofas_raw_data_dir
# ---------------------------------------------------------------------------


def test_raw_data_dir_created_and_returned(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))

    output_dir = get_glofas_raw_data_dir(FORECAST_DATE)

    expected = tmp_path / GLOFAS_RAW_DATA_DIR / FORECAST_DATE
    assert output_dir == str(expected)
    assert os.path.isdir(output_dir)


def test_raw_data_dir_raises_when_cache_dir_env_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATA_CACHE_DIR", raising=False)

    with pytest.raises(ValueError, match="DATA_CACHE_DIR"):
        get_glofas_raw_data_dir(FORECAST_DATE)


# ---------------------------------------------------------------------------
# find_latest_forecast_date_in_cache
# ---------------------------------------------------------------------------


def test_find_latest_returns_most_recent_date(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    raw_dir = tmp_path / GLOFAS_RAW_DATA_DIR
    (raw_dir / "20260320").mkdir(parents=True)
    (raw_dir / "20260325").mkdir(parents=True)
    (raw_dir / "20260322").mkdir(parents=True)

    result = find_latest_forecast_date_in_cache(GLOFAS_RAW_DATA_DIR)

    assert result == "20260325"


def test_find_latest_ignores_non_date_dirs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    raw_dir = tmp_path / GLOFAS_RAW_DATA_DIR
    (raw_dir / "20260320").mkdir(parents=True)
    (raw_dir / "not_a_date").mkdir(parents=True)
    (raw_dir / "readme.txt").parent.mkdir(parents=True, exist_ok=True)
    (raw_dir / "readme.txt").write_text("ignore")

    result = find_latest_forecast_date_in_cache(GLOFAS_RAW_DATA_DIR)

    assert result == "20260320"


def test_find_latest_returns_none_when_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    (tmp_path / GLOFAS_RAW_DATA_DIR).mkdir(parents=True)

    result = find_latest_forecast_date_in_cache(GLOFAS_RAW_DATA_DIR)

    assert result is None


def test_find_latest_returns_none_when_dir_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))

    result = find_latest_forecast_date_in_cache(GLOFAS_RAW_DATA_DIR)

    assert result is None


# ---------------------------------------------------------------------------
# load_glofas_discharge_from_cache
# ---------------------------------------------------------------------------


def test_load_from_cache_with_explicit_date(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    expected = _write_cached_files(tmp_path, FORECAST_DATE, count=3)

    result = load_glofas_discharge_from_cache("KEN", FORECAST_DATE)

    assert result == expected


def test_load_from_cache_succeeds_with_single_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    expected = _write_cached_files(tmp_path, FORECAST_DATE, count=1)

    result = load_glofas_discharge_from_cache("KEN", FORECAST_DATE)

    assert result == expected


def test_load_from_cache_auto_detects_latest_date(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    _write_cached_files(tmp_path, "20260320", count=5)
    expected = _write_cached_files(tmp_path, "20260325", count=3)

    result = load_glofas_discharge_from_cache("KEN", None)

    assert result == expected


def test_load_from_cache_raises_when_no_cache_exists(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))

    with pytest.raises(FileNotFoundError, match="No cached raw GloFAS data found"):
        load_glofas_discharge_from_cache("KEN", None)


def test_load_from_cache_raises_for_nonexistent_date(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))

    with pytest.raises(FileNotFoundError, match="No cached raw GloFAS files found"):
        load_glofas_discharge_from_cache("KEN", "20260101")
