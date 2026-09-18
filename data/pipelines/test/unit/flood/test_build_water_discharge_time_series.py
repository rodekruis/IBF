import math

from pipelines.flood.extract_forecast import (
    build_water_discharge_time_series,
    TimeIntervalDischarge,
)


def test_computes_median_and_percentile_range():
    discharge = TimeIntervalDischarge(
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_discharges=[float(v) for v in range(0, 101, 10)],  # 0, 10, ..., 100
    )

    [entry] = build_water_discharge_time_series([discharge])

    assert entry["median"] == 50.0
    assert entry["low"] == 10.0
    assert entry["high"] == 90.0


def test_skips_entries_with_no_discharge_values():
    empty = TimeIntervalDischarge(
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_discharges=[],
    )
    all_nan = TimeIntervalDischarge(
        time_interval_start="2026-03-21T00:00:00Z",
        time_interval_end="2026-03-21T23:59:59Z",
        ensemble_discharges=[math.nan, math.nan],
    )

    assert build_water_discharge_time_series([empty, all_nan]) == []


def test_preserves_order_across_multiple_time_intervals():
    day1 = TimeIntervalDischarge(
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_discharges=[10.0, 20.0],
    )
    day2 = TimeIntervalDischarge(
        time_interval_start="2026-03-21T00:00:00Z",
        time_interval_end="2026-03-21T23:59:59Z",
        ensemble_discharges=[30.0, 40.0],
    )

    time_series = build_water_discharge_time_series([day1, day2])

    assert [entry["start"] for entry in time_series] == [
        "2026-03-20T00:00:00Z",
        "2026-03-21T00:00:00Z",
    ]
