import math

from pipelines.flood.determine_alerts import (
    determine_temporal_extent,
    ReturnPeriodThresholds,
)
from pipelines.flood.extract_forecast import TimeIntervalDischarge

STATION_CODE = "G0001"
THRESHOLDS: list[ReturnPeriodThresholds] = [
    {
        "station_code": STATION_CODE,
        "thresholds": [
            {"return_period": 1.5, "threshold_value": 100.0},
            {"return_period": 5, "threshold_value": 200.0},
            {"return_period": 10, "threshold_value": 300.0},
        ],
    }
]


def test_ensemble_return_periods_exclude_missing_members():
    # Arrange
    available_discharges = [350.0] * 21 + [250.0] * 13
    discharge = TimeIntervalDischarge(
        time_interval_start="2026-03-20T00:00:00Z",
        time_interval_end="2026-03-20T23:59:59Z",
        ensemble_discharges=available_discharges
        + [math.nan] * 17,  # add 17 missing members
    )

    # Act
    [severity] = determine_temporal_extent(STATION_CODE, [discharge], THRESHOLDS)

    # Assert
    assert severity.median_return_period == 10.0
    assert len(severity.ensemble_return_periods) == len(
        available_discharges
    )  # missing members are excluded
    assert severity.ensemble_return_periods.count(10.0) == 21
    assert severity.ensemble_return_periods.count(5.0) == 13
