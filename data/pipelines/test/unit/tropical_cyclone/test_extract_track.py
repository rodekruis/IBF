from __future__ import annotations

from __future__ import annotations

from pathlib import Path

from pipelines.tropical_cyclone.extract_track import (
    _parse_atcf_coordinate,
    _parse_gefs_track_path,
    _read_track_fixes,
    extract_track,
)


def _atcf_line(
    lead_hour: int, lat: str, lon: str, vmax: float, mslp: float, rad: int = 34
) -> str:
    return (
        f"WP, 01, 2026071000, 03, AC00, {lead_hour:03d}, {lat}, {lon}, "
        f"{vmax}, {mslp}, XX, {rad}, NEQ, 0000, 0000, 0000, 0000"
    )


class TestParseGefsTrackPath:
    def test_parses_control_member(self):
        parsed = _parse_gefs_track_path(
            "gefs.20260710/00/tctrack/ac00.t00z.cyclone.trackatcfunix"
        )
        assert parsed is not None
        assert parsed.cycle_datetime.strftime("%Y%m%d%H") == "2026071000"

    def test_parses_perturbed_member(self):
        parsed = _parse_gefs_track_path(
            "gefs.20260710/00/tctrack/ap01.t00z.cyclone.trackatcfunix"
        )
        assert parsed is not None

    def test_rejects_unrecognized_path(self):
        assert _parse_gefs_track_path("not/a/real/path.txt") is None


class TestParseAtcfCoordinate:
    def test_parses_northern_latitude(self):
        assert _parse_atcf_coordinate("208N", positive_suffix="N") == 20.8

    def test_parses_southern_latitude_as_negative(self):
        assert _parse_atcf_coordinate("208S", positive_suffix="N") == -20.8

    def test_parses_eastern_longitude(self):
        assert _parse_atcf_coordinate("1276E", positive_suffix="E") == 127.6

    def test_parses_western_longitude_as_negative(self):
        assert _parse_atcf_coordinate("1550W", positive_suffix="E") == -155.0


class TestReadTrackFixes:
    def test_parses_fields_correctly(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(_atcf_line(6, "208N", "1276E", 65, 985))

        [(lead_hour, fix)] = _read_track_fixes(
            str(path), bounds=(100.0, 0.0, 150.0, 30.0)
        )

        assert lead_hour == 6
        assert fix.latitude == 20.8
        assert fix.longitude == 127.6
        assert fix.max_sustained_wind_knots == 65.0
        assert fix.min_sea_level_pressure_mb == 985.0

    def test_filters_out_non_matching_rad(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            _atcf_line(0, "100N", "1200E", 50, 990, rad=34)
            + "\n"
            + _atcf_line(0, "100N", "1200E", 50, 990, rad=50)
        )

        fixes = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert len(fixes) == 1

    def test_filters_out_fixes_outside_bounds(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            _atcf_line(0, "100N", "1200E", 50, 990)
            + "\n"
            + _atcf_line(0, "400N", "1200E", 50, 990)
        )

        fixes = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert len(fixes) == 1
        assert fixes[0][1].latitude == 10.0


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