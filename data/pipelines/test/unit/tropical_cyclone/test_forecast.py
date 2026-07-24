from __future__ import annotations

from pathlib import Path

from pipelines.tropical_cyclone.forecast import _most_recent_cycle_files


def _touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


def test_returns_empty_list_when_root_does_not_exist(tmp_path):
    assert _most_recent_cycle_files(tmp_path / "missing") == []


def test_returns_empty_list_when_no_cycle_directories_exist(tmp_path):
    (tmp_path / "not_a_cycle_dir").mkdir()
    assert _most_recent_cycle_files(tmp_path) == []


def test_picks_the_most_recent_date(tmp_path):
    _touch(tmp_path / "gefs.20260710" / "00" / "old.grib2")
    _touch(tmp_path / "gefs.20260714" / "06" / "new.grib2")

    result = _most_recent_cycle_files(tmp_path)

    assert len(result) == 1
    assert result[0].endswith("new.grib2")


def test_picks_the_most_recent_hour_within_the_same_date(tmp_path):
    _touch(tmp_path / "gefs.20260714" / "00" / "early.grib2")
    _touch(tmp_path / "gefs.20260714" / "18" / "late.grib2")

    result = _most_recent_cycle_files(tmp_path)

    assert len(result) == 1
    assert result[0].endswith("late.grib2")


def test_returns_every_file_under_the_chosen_cycle(tmp_path):
    _touch(tmp_path / "gefs.20260714" / "06" / "a.grib2")
    _touch(tmp_path / "gefs.20260714" / "06" / "subdir" / "b.grib2")

    result = _most_recent_cycle_files(tmp_path)

    assert len(result) == 2
