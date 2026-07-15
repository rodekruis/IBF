from __future__ import annotations

from pathlib import Path

from pipelines.tropical_cyclone.extract_track import (
    _parse_atcf_coordinate,
    _parse_gefs_track_path,
    extract_track,
)


class TestParseGefsTrackPath:
    def test_parses_cycle_datetime(self) -> None:
        parsed = _parse_gefs_track_path(
            "gefs.20260710/00/tctrack/ap01.t00z.cyclone.trackatcfunix"
        )

        assert parsed is not None
        assert parsed.cycle_datetime.strftime("%Y%m%d%H") == "2026071000"

    def test_rejects_unrecognized_path(self) -> None:
        assert _parse_gefs_track_path("not/a/real/path.txt") is None


class TestParseAtcfCoordinate:
    def test_parses_positive_coordinate(self) -> None:
        assert _parse_atcf_coordinate("208N", positive_suffix="N") == 20.8

    def test_parses_negative_coordinate(self) -> None:
        assert _parse_atcf_coordinate("1276W", positive_suffix="E") == -127.6


class TestExtractTrack:
    def test_filters_track_fixes_to_bounds(self, tmp_path: Path) -> None:
        track_path = (
            tmp_path
            / "gefs.20260710"
            / "00"
            / "tctrack"
            / "ap01.t00z.cyclone.trackatcfunix"
        )
        track_path.parent.mkdir(parents=True)
        track_path.write_text(
            "\n".join(
                [
                    "WP, 01, 2026071000, 03, GEFS, 003, 208N, 1276E, 50, 980, AAA, 34",
                    "WP, 01, 2026071000, 03, GEFS, 003, 350N, 1400E, 60, 970, AAA, 34",
                ]
            )
            + "\n"
        )

        result = extract_track(
            [str(track_path)],
            bounds=(120.0, 20.0, 130.0, 25.0),
        )

        assert len(result) == 1
        assert result[0].time_interval_start == "2026-07-10T03:00:00Z"
        assert result[0].time_interval_end == "2026-07-10T06:00:00Z"
        assert len(result[0].ensemble_track_fixes) == 1
        assert result[0].ensemble_track_fixes[0].latitude == 20.8
        assert result[0].ensemble_track_fixes[0].longitude == 127.6
        assert result[0].ensemble_track_fixes[0].max_sustained_wind_knots == 50.0
        assert result[0].ensemble_track_fixes[0].min_sea_level_pressure_mb == 980.0
