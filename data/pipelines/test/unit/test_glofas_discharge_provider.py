from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from pipelines.infra.data_types.glofas_discharge_provider import (
    _validate_ensemble_count,
    GLOFAS_MIN_ENSEMBLE_COUNT,
)
from pipelines.infra.utils.path_helpers import (
    get_cached_glofas_files,
    get_glofas_raw_data_dir,
    GLOFAS_RAW_DATA_DIR,
)

FORECAST_DATE = "2026032600"
REUSE_PERIOD_HOURS = 12


def _write_cached_files(
    cache_base: Path,
    forecast_date: str,
    count: int,
    age_hours: float = 0.0,
) -> list[str]:
    """Create `count` NetCDF cache files for `forecast_date`, aged `age_hours`."""
    cache_dir = cache_base / GLOFAS_RAW_DATA_DIR / forecast_date
    cache_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    mtime = time.time() - age_hours * 3600
    for ensemble_index in range(count):
        path = cache_dir / f"dis_{ensemble_index:02d}_{forecast_date}00.nc"
        path.write_bytes(b"")
        os.utime(path, (mtime, mtime))
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
# get_cached_glofas_files (GLOFAS_DATA_REUSE_PERIOD_HOURS logic)
# ---------------------------------------------------------------------------


def test_cached_files_returned_when_fresh(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    expected = _write_cached_files(tmp_path, FORECAST_DATE, count=51, age_hours=1.0)

    result = get_cached_glofas_files(FORECAST_DATE, REUSE_PERIOD_HOURS)

    assert result == expected


def test_cached_files_returned_at_age_boundary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    # Just under the reuse window so it stays valid despite timing jitter.
    expected = _write_cached_files(
        tmp_path, FORECAST_DATE, count=51, age_hours=REUSE_PERIOD_HOURS - 0.01
    )

    result = get_cached_glofas_files(FORECAST_DATE, REUSE_PERIOD_HOURS)

    assert result == expected


def test_cached_files_none_when_stale(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    _write_cached_files(
        tmp_path, FORECAST_DATE, count=51, age_hours=REUSE_PERIOD_HOURS + 1
    )

    result = get_cached_glofas_files(FORECAST_DATE, REUSE_PERIOD_HOURS)

    assert result is None


def test_cached_files_none_when_dir_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))

    result = get_cached_glofas_files(FORECAST_DATE, REUSE_PERIOD_HOURS)

    assert result is None


def test_cached_files_none_when_no_netcdf_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_CACHE_DIR", str(tmp_path))
    cache_dir = tmp_path / GLOFAS_RAW_DATA_DIR / FORECAST_DATE
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "not-a-netcdf.txt").write_bytes(b"")

    result = get_cached_glofas_files(FORECAST_DATE, REUSE_PERIOD_HOURS)

    assert result is None


def test_cached_files_none_when_cache_dir_env_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATA_CACHE_DIR", raising=False)

    result = get_cached_glofas_files(FORECAST_DATE, REUSE_PERIOD_HOURS)

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
