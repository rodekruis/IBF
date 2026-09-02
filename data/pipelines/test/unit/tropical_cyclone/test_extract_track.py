from __future__ import annotations

from pathlib import Path
from typing import ClassVar

import pytest
from pipelines.infra.data_types.admin_area_types import (
    AdminArea,
    AdminAreaProperties,
    AdminAreasSet,
)
from pipelines.infra.data_types.enums import ForecastSource
from pipelines.tropical_cyclone.determine_alerts import TimeIntervalWindSpeedSeverity
from pipelines.tropical_cyclone.extract_track import (
    _ecmwf_message_fixes,
    _parse_atcf_coordinate,
    _parse_ecmwf_track_path,
    _parse_gefs_track_path,
    _read_track_fixes,
    derive_alert_centroid,
    extract_track,
    find_storm_pairs_sharing_place_codes,
    select_place_codes_near_storm,
    StormTrack,
    TimeIntervalTrackFix,
    TrackFix,
)


def _atcf_line(
    lead_hour: int,
    lat: str,
    lon: str,
    vmax: float,
    mslp: float,
    rad: int = 34,
    basin: str = "WP",
    storm_number: str = "01",
) -> str:
    return (
        f"{basin}, {storm_number}, 2026071000, 03, AC00, {lead_hour:03d}, {lat}, {lon}, "
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

        [row] = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert row.lead_hour == 6
        assert row.track_fix.latitude == 20.8
        assert row.track_fix.longitude == 127.6
        assert row.track_fix.max_sustained_wind_knots == 65.0
        assert row.track_fix.min_sea_level_pressure_mb == 985.0

    def test_retains_the_basin_and_storm_number_from_the_row(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            _atcf_line(0, "100N", "1200E", 50, 990, basin="EP", storm_number="06")
        )

        [row] = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert row.basin == "EP"
        assert row.storm_number == "06"

    def test_keeps_the_storm_numbers_leading_zero(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            _atcf_line(0, "100N", "1200E", 50, 990, storm_number="06"),
        )

        [row] = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert row.storm_number == "06"

    def test_drops_a_row_for_an_atcf_invest(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            _atcf_line(0, "100N", "1200E", 50, 990, storm_number="11")
            + "\n"
            + _atcf_line(0, "100N", "1200E", 50, 990, storm_number="98")
        )

        rows = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert [row.storm_number for row in rows] == ["11"]

    def test_keeps_the_highest_storm_number_below_the_invest_range(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            _atcf_line(0, "100N", "1200E", 50, 990, storm_number="89"),
        )

        rows = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert len(rows) == 1

    def test_drops_every_storm_number_in_the_invest_range(self, tmp_path):
        path = tmp_path / "track.txt"
        path.write_text(
            "\n".join(
                _atcf_line(0, "100N", "1200E", 50, 990, storm_number=str(number))
                for number in range(90, 100)
            )
        )

        assert _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0)) == []

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

        rows = _read_track_fixes(str(path), bounds=(100.0, 0.0, 150.0, 30.0))

        assert len(rows) == 1
        assert rows[0].track_fix.latitude == 10.0


def _write_track_file(
    tmp_path: Path, lines: list[str], member: str = "ap01", cycle: str = "gefs.20260710"
) -> Path:
    track_path = (
        tmp_path / cycle / "00" / "tctrack" / f"{member}.t00z.cyclone.trackatcfunix"
    )
    track_path.parent.mkdir(parents=True, exist_ok=True)
    track_path.write_text("\n".join(lines) + "\n")
    return track_path


class TestExtractTrack:
    def test_filters_track_fixes_to_bounds(self, tmp_path: Path) -> None:
        track_path = _write_track_file(
            tmp_path,
            [
                "WP, 01, 2026071000, 03, GEFS, 003, 208N, 1276E, 50, 980, AAA, 34",
                "WP, 01, 2026071000, 03, GEFS, 003, 350N, 1400E, 60, 970, AAA, 34",
            ],
        )

        [storm] = extract_track(
            [str(track_path)],
            bounds=(120.0, 20.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        [bucket] = storm.time_interval_track_fixes
        assert bucket.time_interval_start == "2026-07-10T03:00:00Z"
        assert bucket.time_interval_end == "2026-07-10T09:00:00Z"
        assert len(bucket.ensemble_track_fixes) == 1
        assert bucket.ensemble_track_fixes[0].latitude == 20.8
        assert bucket.ensemble_track_fixes[0].longitude == 127.6
        assert bucket.ensemble_track_fixes[0].max_sustained_wind_knots == 50.0
        assert bucket.ensemble_track_fixes[0].min_sea_level_pressure_mb == 980.0

    def test_groups_interleaved_rows_into_one_storm_track_per_storm(
        self, tmp_path: Path
    ) -> None:
        # A real ATCF file interleaves every storm the tracker follows, rather than grouping them.
        track_path = _write_track_file(
            tmp_path,
            [
                _atcf_line(0, "200N", "1250E", 50, 980, basin="WP", storm_number="11"),
                _atcf_line(0, "210N", "1260E", 40, 990, basin="WP", storm_number="12"),
                _atcf_line(6, "205N", "1255E", 55, 975, basin="WP", storm_number="11"),
                _atcf_line(6, "215N", "1265E", 45, 985, basin="WP", storm_number="12"),
            ],
        )

        storms = extract_track(
            [str(track_path)],
            bounds=(120.0, 15.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        assert [storm.storm_number for storm in storms] == ["11", "12"]
        assert all(len(storm.time_interval_track_fixes) == 2 for storm in storms)

    def test_distinguishes_the_same_storm_number_in_different_basins(
        self, tmp_path: Path
    ) -> None:
        track_path = _write_track_file(
            tmp_path,
            [
                _atcf_line(0, "200N", "1250E", 50, 980, basin="WP", storm_number="09"),
                _atcf_line(0, "210N", "1260E", 40, 990, basin="CP", storm_number="09"),
            ],
        )

        storms = extract_track(
            [str(track_path)],
            bounds=(120.0, 15.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        assert [storm.basin for storm in storms] == ["CP", "WP"]

    def test_pools_every_members_fix_for_one_storm(self, tmp_path: Path) -> None:
        line = _atcf_line(0, "200N", "1250E", 50, 980, storm_number="11")
        paths = [
            str(_write_track_file(tmp_path, [line], member=member))
            for member in ("ac00", "ap01", "ap02")
        ]

        [storm] = extract_track(
            paths,
            bounds=(120.0, 15.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        [bucket] = storm.time_interval_track_fixes
        assert len(bucket.ensemble_track_fixes) == 3

    def test_returns_storms_in_a_stable_order_regardless_of_row_order(
        self, tmp_path: Path
    ) -> None:
        track_path = _write_track_file(
            tmp_path,
            [
                _atcf_line(0, "200N", "1250E", 50, 980, basin="WP", storm_number="24"),
                _atcf_line(0, "210N", "1260E", 40, 990, basin="EP", storm_number="06"),
                _atcf_line(0, "205N", "1255E", 45, 985, basin="WP", storm_number="11"),
            ],
        )

        storms = extract_track(
            [str(track_path)],
            bounds=(120.0, 15.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        assert [storm.storm_identifier for storm in storms] == [
            "EP06_2026",
            "WP11_2026",
            "WP24_2026",
        ]

    def test_excludes_a_storm_whose_only_rows_are_an_invest(
        self, tmp_path: Path
    ) -> None:
        track_path = _write_track_file(
            tmp_path,
            [
                _atcf_line(0, "200N", "1250E", 50, 980, storm_number="11"),
                _atcf_line(0, "200N", "1250E", 50, 980, storm_number="98"),
            ],
        )

        storms = extract_track(
            [str(track_path)],
            bounds=(120.0, 15.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        assert [storm.storm_number for storm in storms] == ["11"]

    def test_derives_the_season_year_from_the_forecast_cycle(
        self, tmp_path: Path
    ) -> None:
        track_path = _write_track_file(
            tmp_path,
            ["WP, 24, 2025091812, 03, GEFS, 000, 200N, 1250E, 50, 980, AAA, 34"],
            member="ac00",
            cycle="gefs.20250918",
        )

        [storm] = extract_track(
            [str(track_path)],
            bounds=(120.0, 15.0, 130.0, 25.0),
            forecast_source=ForecastSource.GEFS,
        )

        assert storm.season_year == 2025
        assert storm.storm_identifier == "WP24_2025"

    def test_returns_no_storms_when_every_fix_is_outside_the_bounds(
        self, tmp_path: Path
    ) -> None:
        track_path = _write_track_file(
            tmp_path, [_atcf_line(0, "600N", "1000W", 50, 980)]
        )

        assert (
            extract_track(
                [str(track_path)],
                bounds=(120.0, 15.0, 130.0, 25.0),
                forecast_source=ForecastSource.GEFS,
            )
            == []
        )

    def test_raises_for_the_ecmwf_forecast_source(self, tmp_path: Path) -> None:
        with pytest.raises(NotImplementedError, match="GEFS"):
            extract_track(
                [],
                bounds=(120.0, 15.0, 130.0, 25.0),
                forecast_source=ForecastSource.ECMWF,
            )


class TestStormIdentifier:
    def test_joins_the_basin_the_storm_number_and_the_season_year(self):
        storm = StormTrack(
            basin="WP",
            storm_number="24",
            season_year=2025,
            time_interval_track_fixes=[],
        )

        assert storm.storm_identifier == "WP24_2025"

    def test_keeps_the_storm_numbers_leading_zero_in_the_identifier(self):
        storm = StormTrack(
            basin="EP",
            storm_number="06",
            season_year=2026,
            time_interval_track_fixes=[],
        )

        assert storm.storm_identifier == "EP06_2026"


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


class TestDeriveAlertCentroid:
    _PLACE_CODES: ClassVar[list[str]] = ["PC001"]

    def test_returns_none_when_the_peak_wind_time_is_after_the_tracked_window(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, 1.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.5, 1.5)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T12:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is None

    def test_returns_none_when_the_peak_wind_time_is_before_the_tracked_window(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.0, 1.0)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(1.5, 1.5)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T00:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is None

    def test_returns_none_when_there_are_no_track_fixes(self):
        severities = [_make_severity(45.0, "2026-07-10T00:00:00Z")]

        centroid = derive_alert_centroid(
            [], severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is None

    def test_a_peak_wind_time_on_the_tracked_window_edge_counts_as_inside_it(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, 1.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.5, 1.5)]),
        ]

        for peak_time in ("2026-07-10T00:00:00Z", "2026-07-10T06:00:00Z"):
            centroid = derive_alert_centroid(
                track_fixes,
                [_make_severity(45.0, peak_time)],
                self._PLACE_CODES,
                _build_admin_areas(),
            )

            assert centroid is not None

    def test_gates_on_the_highest_median_bucket_not_the_first_one(self):
        track_fixes = [_make_track_bucket("2026-07-10T00:00:00Z", [(1.0, 1.0)])]
        severities = [
            _make_severity(10.0, "2026-07-10T00:00:00Z"),
            _make_severity(45.0, "2026-07-10T12:00:00Z"),
        ]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is None

    def test_returns_the_first_bucket_that_lies_inside_the_admin_areas(self):
        # The storm starts inside the admin area, so its first bucket is the entry point.
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, 1.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.5, 1.5)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(5.0, 5.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T12:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == 1.0
        assert centroid.longitude == 1.0

    def test_reports_the_pseudo_track_entry_when_the_first_bucket_lies_outside(self):
        # The storm starts outside and its second bucket is inside: the entry point is where the
        # segment between them crosses the square's edge (the corner (2, 2) here), not the inside
        # bucket itself.
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(5.0, 5.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.0, 1.0)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(1.5, 1.5)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T12:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == pytest.approx(2.0)
        assert centroid.longitude == pytest.approx(2.0)

    def test_tests_a_buckets_ensemble_mean_rather_than_its_individual_fixes(self):
        # Neither member fix is inside the admin areas; their mean is.
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, -3.0), (1.0, 5.0)])
        ]
        severities = [_make_severity(45.0, "2026-07-10T00:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == 1.0
        assert centroid.longitude == 1.0

    def test_orders_buckets_by_time_regardless_of_input_order(self):
        track_fixes = [
            _make_track_bucket("2026-07-10T12:00:00Z", [(1.5, 1.5)]),
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, 1.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T06:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == 1.0
        assert centroid.longitude == 1.0

    def test_returns_the_pseudo_track_crossing_point_between_two_outside_buckets(self):
        # Both centroids sit outside the admin area (the 0-2 degree square); the straight line
        # between them crosses its left edge (longitude 0) at latitude 1.
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, -2.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.0, 4.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T06:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == pytest.approx(1.0)
        assert centroid.longitude == pytest.approx(0.0)

    def test_reports_the_earliest_crossing_when_the_pseudo_track_enters_twice(self):
        # The track enters the square through its bottom edge at (1.3, 0), leaves through the
        # right edge at (2, 0.875), then re-enters through the right edge at (2, 1.75). The first
        # entry in time order is (1.3, 0).
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(-1.0, 0.5)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.5, 2.5)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(2.5, 0.5)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T12:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == pytest.approx(0.0)
        assert centroid.longitude == pytest.approx(1.3)

    def test_skips_a_zero_length_segment_without_dropping_the_track(self):
        # The storm is stationary between the first two buckets, then moves into the square.
        track_fixes = [
            _make_track_bucket("2026-07-10T00:00:00Z", [(1.0, -1.0)]),
            _make_track_bucket("2026-07-10T06:00:00Z", [(1.0, -1.0)]),
            _make_track_bucket("2026-07-10T12:00:00Z", [(1.0, 1.0)]),
        ]
        severities = [_make_severity(45.0, "2026-07-10T12:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == pytest.approx(1.0)
        assert centroid.longitude == pytest.approx(0.0)

    def test_a_single_bucket_outside_the_admin_areas_reports_the_nearest_union_point(
        self,
    ):
        # With one bucket the pseudo-track is a single point at (5, 5); the closest point in the
        # square is its corner (2, 2).
        track_fixes = [_make_track_bucket("2026-07-10T00:00:00Z", [(5.0, 5.0)])]
        severities = [_make_severity(45.0, "2026-07-10T00:00:00Z")]

        centroid = derive_alert_centroid(
            track_fixes, severities, self._PLACE_CODES, _build_admin_areas()
        )

        assert centroid is not None
        assert centroid.latitude == pytest.approx(2.0)
        assert centroid.longitude == pytest.approx(2.0)


def _make_square_admin_area(pcode: str, min_lon: float, min_lat: float) -> AdminArea:
    """A 1-degree square with its lower-left corner at (min_lon, min_lat)."""
    return AdminArea(
        properties=AdminAreaProperties(
            pcode=pcode, name=pcode, admin_level=1, country_code="PC"
        ),
        geometry_type="Polygon",
        coordinates=[
            [
                [min_lon, min_lat],
                [min_lon, min_lat + 1.0],
                [min_lon + 1.0, min_lat + 1.0],
                [min_lon + 1.0, min_lat],
                [min_lon, min_lat],
            ]
        ],
    )


def _build_spread_admin_areas() -> AdminAreasSet:
    """Three 1-degree squares far enough apart that a small buffer reaches only one."""
    return AdminAreasSet(
        admin_areas={
            "PC_WEST": _make_square_admin_area("PC_WEST", 0.0, 0.0),
            "PC_MIDDLE": _make_square_admin_area("PC_MIDDLE", 10.0, 0.0),
            "PC_EAST": _make_square_admin_area("PC_EAST", 20.0, 0.0),
        }
    )


def _make_storm_track(
    fixes: list[tuple[float, float]],
    basin: str = "WP",
    storm_number: str = "11",
) -> StormTrack:
    return StormTrack(
        basin=basin,
        storm_number=storm_number,
        season_year=2026,
        time_interval_track_fixes=[
            _make_track_bucket(f"2026-07-10T{hour:02d}:00:00Z", [fix])
            for hour, fix in enumerate(fixes)
        ],
    )


class TestSelectPlaceCodesNearStorm:
    _PLACE_CODES: ClassVar[list[str]] = ["PC_WEST", "PC_MIDDLE", "PC_EAST"]

    def test_returns_only_the_admin_areas_the_padded_storm_box_reaches(self):
        storm = _make_storm_track([(0.5, 0.5)])

        selected = select_place_codes_near_storm(
            storm, self._PLACE_CODES, _build_spread_admin_areas(), buffer_km=100.0
        )

        assert selected == ["PC_WEST"]

    def test_returns_an_empty_list_when_no_admin_area_is_near_the_storm(self):
        storm = _make_storm_track([(0.5, 50.0)])

        selected = select_place_codes_near_storm(
            storm, self._PLACE_CODES, _build_spread_admin_areas(), buffer_km=100.0
        )

        assert selected == []

    def test_a_wider_buffer_reaches_more_admin_areas(self):
        storm = _make_storm_track([(0.5, 0.5)])
        admin_areas = _build_spread_admin_areas()

        narrow = select_place_codes_near_storm(
            storm, self._PLACE_CODES, admin_areas, buffer_km=100.0
        )
        wide = select_place_codes_near_storm(
            storm, self._PLACE_CODES, admin_areas, buffer_km=1200.0
        )

        assert narrow == ["PC_WEST"]
        assert wide == ["PC_WEST", "PC_MIDDLE"]

    def test_uses_every_fix_in_the_track_not_just_the_first_one(self):
        # The storm starts over PC_WEST and ends over PC_EAST; a box built from only the first
        # fix would miss the east square entirely.
        storm = _make_storm_track([(0.5, 0.5), (0.5, 10.5), (0.5, 20.5)])

        selected = select_place_codes_near_storm(
            storm, self._PLACE_CODES, _build_spread_admin_areas(), buffer_km=10.0
        )

        assert selected == ["PC_WEST", "PC_MIDDLE", "PC_EAST"]

    def test_preserves_the_order_of_the_given_place_codes(self):
        storm = _make_storm_track([(0.5, 0.5), (0.5, 20.5)])

        selected = select_place_codes_near_storm(
            storm,
            ["PC_EAST", "PC_WEST"],
            _build_spread_admin_areas(),
            buffer_km=10.0,
        )

        assert selected == ["PC_EAST", "PC_WEST"]

    def test_ignores_a_place_code_that_has_no_admin_area_geometry(self):
        storm = _make_storm_track([(0.5, 0.5)])

        selected = select_place_codes_near_storm(
            storm,
            ["PC_MISSING", "PC_WEST"],
            _build_spread_admin_areas(),
            buffer_km=100.0,
        )

        assert selected == ["PC_WEST"]


class TestFindStormPairsSharingPlaceCodes:
    def test_reports_a_pair_of_storms_that_share_an_admin_area(self):
        storms = [
            _make_storm_track([(0.5, 0.5)], storm_number="11"),
            _make_storm_track([(0.5, 0.5)], storm_number="12"),
        ]

        pairs = find_storm_pairs_sharing_place_codes(
            storms, [["PC_WEST", "PC_MIDDLE"], ["PC_MIDDLE"]]
        )

        assert pairs == [("WP11_2026", "WP12_2026")]

    def test_reports_nothing_when_every_storm_has_its_own_admin_areas(self):
        storms = [
            _make_storm_track([(0.5, 0.5)], storm_number="11"),
            _make_storm_track([(0.5, 0.5)], storm_number="12"),
        ]

        pairs = find_storm_pairs_sharing_place_codes(storms, [["PC_WEST"], ["PC_EAST"]])

        assert pairs == []

    def test_reports_each_pair_of_storms_only_once(self):
        storms = [
            _make_storm_track([(0.5, 0.5)], storm_number="11"),
            _make_storm_track([(0.5, 0.5)], storm_number="12"),
            _make_storm_track([(0.5, 0.5)], storm_number="13"),
        ]

        pairs = find_storm_pairs_sharing_place_codes(
            storms, [["PC_WEST"], ["PC_WEST"], ["PC_WEST"]]
        )

        assert pairs == [
            ("WP11_2026", "WP12_2026"),
            ("WP11_2026", "WP13_2026"),
            ("WP12_2026", "WP13_2026"),
        ]

    def test_reports_nothing_for_a_single_storm(self):
        storms = [_make_storm_track([(0.5, 0.5)])]

        assert find_storm_pairs_sharing_place_codes(storms, [["PC_WEST"]]) == []
