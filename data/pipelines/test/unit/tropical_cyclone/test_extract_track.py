# ruff: noqa: I001
# TODO-infra: ufmt and ruff disagree on this file's import order
from __future__ import annotations

from pathlib import Path

import pytest
from pipelines.infra.data_types.enums import ForecastSource
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalWindSpeedSeverity
from pipelines.tropical_cyclone.extract_track import (
    _ecmwf_message_fixes,
    _parse_atcf_coordinate,
    _parse_ecmwf_track_path,
    _parse_gefs_track_path,
    _read_track_fixes,
    derive_storm_centroid,
    extract_track,
    TimeIntervalTrackFix,
    TrackFix,
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
            "WP, 01, 2026071000, 03, GEFS, 003, 208N, 1276E, 50, 980, AAA, 34\n"
            "WP, 01, 2026071000, 03, GEFS, 003, 350N, 1400E, 60, 970, AAA, 34\n"
        )

        result = extract_track(
            [str(track_path)],
            bounds=(120.0, 20.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        assert len(result) == 1
        assert result[0].time_interval_start == "2026-07-10T03:00:00Z"
        assert result[0].time_interval_end == "2026-07-10T09:00:00Z"
        assert len(result[0].ensemble_track_fixes) == 1
        assert result[0].ensemble_track_fixes[0].latitude == 20.8
        assert result[0].ensemble_track_fixes[0].longitude == 127.6
        assert result[0].ensemble_track_fixes[0].max_sustained_wind_knots == 50.0
        assert result[0].ensemble_track_fixes[0].min_sea_level_pressure_mb == 980.0


class TestParseEcmwfTrackPath:
    def test_parses_enfo_run(self):
        parsed = _parse_ecmwf_track_path(
            "20260710/00z/ifs/0p25/enfo/20260710000000-360h-enfo-tf.bufr"
        )
        assert parsed is not None
        assert parsed.cycle_datetime.strftime("%Y%m%d%H") == "2026071000"

    def test_parses_oper_run(self):
        parsed = _parse_ecmwf_track_path(
            "20260710/06z/ifs/0p25/oper/20260710060000-144h-oper-tf.bufr"
        )
        assert parsed is not None
        assert parsed.cycle_datetime.strftime("%Y%m%d%H") == "2026071006"

    def test_rejects_mismatched_stream(self):
        assert (
            _parse_ecmwf_track_path(
                "20260710/00z/ifs/0p25/enfo/20260710000000-360h-oper-tf.bufr"
            )
            is None
        )

    def test_rejects_unrecognized_path(self):
        assert _parse_ecmwf_track_path("not/a/real/path.bufr") is None


class TestEcmwfMessageFixes:
    # significance 1 = storm centre, 3 = location of max wind; they interleave in the same
    # latitude/longitude sequence (two entries per fix), while timePeriod has one entry per fix.
    _BOUNDS = (100.0, 0.0, 150.0, 30.0)

    def test_pairs_centre_fixes_with_time_periods(self):
        fixes = _ecmwf_message_fixes(
            significances=[1, 3, 1, 3],
            latitudes=[20.8, 20.9, 21.0, 21.1],
            longitudes=[127.6, 127.7, 127.8, 127.9],
            winds_ms=[30.0, 35.0, 31.0, 36.0],
            pressures_pa=[98000.0, 97000.0, 97500.0, 96500.0],
            time_periods=[6, 12],
            bounds=self._BOUNDS,
        )

        assert [lead_hour for lead_hour, _ in fixes] == [6, 12]
        first = fixes[0][1]
        assert first.latitude == 20.8
        assert first.longitude == 127.6
        assert first.max_sustained_wind_knots == pytest.approx(30.0 * 1.943844)
        assert first.min_sea_level_pressure_mb == pytest.approx(980.0)

    def test_filters_centre_fixes_outside_bounds(self):
        fixes = _ecmwf_message_fixes(
            significances=[1, 1],
            latitudes=[10.0, 40.0],
            longitudes=[120.0, 120.0],
            winds_ms=[30.0, 30.0],
            pressures_pa=[98000.0, 98000.0],
            time_periods=[6, 12],
            bounds=self._BOUNDS,
        )

        assert len(fixes) == 1
        assert fixes[0][1].latitude == 10.0

    def test_missing_wind_or_pressure_defaults_to_zero(self):
        fixes = _ecmwf_message_fixes(
            significances=[1],
            latitudes=[10.0],
            longitudes=[120.0],
            winds_ms=[1e11],
            pressures_pa=[1e11],
            time_periods=[6],
            bounds=self._BOUNDS,
        )

        assert fixes[0][1].max_sustained_wind_knots == 0.0
        assert fixes[0][1].min_sea_level_pressure_mb == 0.0
def _make_severity(
    median_wind_speed: float, time_interval_start: str
) -> TimeIntervalWindSpeedSeverity:
    return TimeIntervalWindSpeedSeverity(
        time_interval_start=time_interval_start,
        time_interval_end="unused",
        median_wind_speed=median_wind_speed,
        ensemble_wind_speeds=[],
        ensemble_wind_speed_rasters=[],
    )


def _make_track_bucket(
    time_interval_start: str, fixes: list[tuple[float, float]]
) -> TimeIntervalTrackFix:
    return TimeIntervalTrackFix(
        time_interval_start=time_interval_start,
        time_interval_end="unused",
        ensemble_track_fixes=[
            TrackFix(
                latitude=latitude,
                longitude=longitude,
                max_sustained_wind_knots=0.0,
                min_sea_level_pressure_mb=0.0,
            )
            for latitude, longitude in fixes
        ],
    )


def _build_admin_areas() -> AdminAreasSet:
    return AdminAreasSet(
        admin_areas={
            "PC001": AdminArea(
                properties=AdminAreaProperties(
                    pcode="PC001", name="PC001", admin_level=1, country_code="PC"
                ),
                geometry_type="Polygon",
                coordinates=[
                    [[0.0, 0.0], [0.0, 2.0], [2.0, 2.0], [2.0, 0.0], [0.0, 0.0]]
                ],
            )
        }
    )


class TestDeriveStormCentroid:
    def test_exact_time_match_uses_that_buckets_ensemble_mean(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(10.0, 100.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(10.0, 100.0), (12.0, 102.0)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(30.0, 130.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T06:00:00Z")]

        centroid = derive_storm_centroid(track_fixes, severities, _build_admin_areas())

        assert centroid.latitude == 11.0
        assert centroid.longitude == 101.0

    def test_interpolates_between_the_two_bracketing_buckets(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(10.0, 100.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(20.0, 110.0)]),
        ]
        # Peak at +3h, exactly halfway between the two real 6h-apart track fixes.
        severities = [_make_severity(45.0, "2026-07-10T03:00:00Z")]

        centroid = derive_storm_centroid(track_fixes, severities, _build_admin_areas())

        assert centroid.latitude == 15.0
        assert centroid.longitude == 105.0

    def test_clamps_to_the_last_bucket_when_peak_is_after_the_observed_window(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(10.0, 100.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(20.0, 110.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T12:00:00Z")]

        centroid = derive_storm_centroid(track_fixes, severities, _build_admin_areas())

        assert centroid.latitude == 20.0
        assert centroid.longitude == 110.0

    def test_clamps_to_the_first_bucket_when_peak_is_before_the_observed_window(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T06:00:00Z", [(10.0, 100.0)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(20.0, 110.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T00:00:00Z")]

        centroid = derive_storm_centroid(track_fixes, severities, _build_admin_areas())

        assert centroid.latitude == 10.0
        assert centroid.longitude == 100.0

    def test_falls_back_to_admin_area_centroid_when_there_are_no_track_fixes(self):
        severities = [_make_severity(45.0, "2026-07-10T00:00:00Z")]

        centroid = derive_storm_centroid([], severities, _build_admin_areas())

        assert centroid.latitude == 1.0
        assert centroid.longitude == 1.0
