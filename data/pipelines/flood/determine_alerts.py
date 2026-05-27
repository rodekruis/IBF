from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TypedDict

import numpy as np

from pipelines.flood.extract_forecast import TimeIntervalDischarge
from pipelines.infra.data_types.location_point import LocationPoint

# TODO-infra: where to put this constant?
MINIMUM_RETURN_PERIOD = "1.5yr"


@dataclass
class TimeIntervalSeverity:
    time_interval_start: str
    time_interval_end: str
    median_discharge: float
    ensemble_discharges: list[float]
    return_period: str


@dataclass
class AlertStation:
    station_code: str
    station: LocationPoint
    time_interval_severities: list[TimeIntervalSeverity]


class ReturnPeriodThresholdValue(TypedDict):
    return_period: float
    threshold_value: float


class ReturnPeriodThresholds(TypedDict):
    station_code: str
    thresholds: list[ReturnPeriodThresholdValue]


def determine_temporal_extent(
    station_code: str,
    time_interval_discharges: list[TimeIntervalDischarge],
    thresholds: list[ReturnPeriodThresholds],
    minimum_return_period: str = MINIMUM_RETURN_PERIOD,
) -> list[TimeIntervalSeverity]:
    """
    Compute lead time severities for one station by comparing the median
    ensemble discharge against return period thresholds.
    Returns a list of lead time severities for the station.
    """
    station_thresholds = _prepare_station_threshold(
        station_code, thresholds, minimum_return_period
    )
    if station_thresholds is None:
        return []

    time_interval_severities: list[TimeIntervalSeverity] = []
    for time_interval_discharge in time_interval_discharges:
        ensemble_array = np.asarray(
            time_interval_discharge.ensemble_discharges,
            dtype=float,
        )
        if np.isnan(ensemble_array).all():
            continue
        median_discharge = float(np.nanmedian(ensemble_array))
        return_period = _match_return_period(median_discharge, station_thresholds)
        if return_period is not None:
            time_interval_severities.append(
                TimeIntervalSeverity(
                    time_interval_start=time_interval_discharge.time_interval_start,
                    time_interval_end=time_interval_discharge.time_interval_end,
                    median_discharge=median_discharge,
                    ensemble_discharges=time_interval_discharge.ensemble_discharges,
                    return_period=return_period,
                )
            )

    return time_interval_severities


def _format_return_period_label(return_period: float) -> str:
    return f"{return_period:g}yr"


def _get_station_return_period_thresholds(
    thresholds: list[ReturnPeriodThresholds],
    station_code: str,
) -> dict[str, float] | None:
    for station_threshold in thresholds:
        if station_threshold["station_code"] != station_code:
            continue

        return {
            _format_return_period_label(threshold["return_period"]): threshold[
                "threshold_value"
            ]
            for threshold in station_threshold["thresholds"]
        }

    return None


def _match_return_period(
    discharge: float,
    station_thresholds: dict[str, float],
) -> str | None:
    """
    Find the highest return period whose threshold the discharge exceeds.
    Thresholds are expected as e.g. {"2yr": 100, "5yr": 200, "10yr": 350, ...}.
    Returns the label of the highest exceeded return period, or None if none exceeded.
    """
    # sort thresholds descending by value to find the highest exceeded efficiently
    for return_period, threshold_value in sorted(
        station_thresholds.items(), key=lambda item: item[1], reverse=True
    ):
        if discharge > threshold_value:
            return return_period
    return None


def _prepare_station_threshold(
    station_code: str,
    thresholds: list[ReturnPeriodThresholds],
    minimum_return_period: str = MINIMUM_RETURN_PERIOD,
) -> dict[str, float] | None:
    """
    Retrieve and validate station return-period thresholds.
    Returns the station thresholds dict, or None if validation fails.
    """
    station_thresholds = _get_station_return_period_thresholds(thresholds, station_code)
    if station_thresholds is None:
        logging.warning(
            f"No return period thresholds for station {station_code}, skipping"
        )
        return None

    if minimum_return_period not in station_thresholds:
        logging.warning(
            f"Return period '{minimum_return_period}' not found for station {station_code}, skipping"
        )
        return None

    return station_thresholds
