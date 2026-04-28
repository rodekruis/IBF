from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass
from typing import TypedDict

from pipelines.flood.extract_forecast import TimeIntervalDischarge
from pipelines.infra.data_types.location_point import LocationPoint

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
    lead_time_severities: list[TimeIntervalSeverity]


class ReturnPeriodThresholdValue(TypedDict):
    return_period: float
    threshold_value: float


class ReturnPeriodThresholds(TypedDict):
    station_code: str
    thresholds: list[ReturnPeriodThresholdValue]


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
    matched: str | None = None
    matched_value: float = 0.0

    for return_period, threshold_value in station_thresholds.items():
        if discharge > threshold_value and threshold_value >= matched_value:
            matched = return_period
            matched_value = threshold_value

    return matched


def determine_temporal_extent(
    station_code: str,
    lead_times: list[TimeIntervalDischarge],
    thresholds: list[ReturnPeriodThresholds],
    minimum_return_period: str = MINIMUM_RETURN_PERIOD,
) -> list[TimeIntervalSeverity]:
    """
    Compute lead time severities for one station by comparing the median
    ensemble discharge against return period thresholds.
    Returns a list of lead time severities for the station.
    """
    station_thresholds = _get_station_return_period_thresholds(thresholds, station_code)
    if station_thresholds is None:
        logging.warning(
            f"No return period thresholds for station {station_code}, skipping"
        )
        return []

    if minimum_return_period not in station_thresholds:
        logging.warning(
            f"Return period '{minimum_return_period}' not found for station {station_code}, skipping"
        )
        return []

    lead_time_severities: list[TimeIntervalSeverity] = []
    for lead_time_discharge in lead_times:
        if not lead_time_discharge.ensemble_discharges:
            continue
        median_discharge = statistics.median(
            lead_time_discharge.ensemble_discharges
        )
        matched_rp = _match_return_period(median_discharge, station_thresholds)
        if matched_rp is not None:
            lead_time_severities.append(
                TimeIntervalSeverity(
                    time_interval_start=lead_time_discharge.time_interval_start,
                    time_interval_end=lead_time_discharge.time_interval_end,
                    median_discharge=median_discharge,
                    ensemble_discharges=lead_time_discharge.ensemble_discharges,
                    return_period=matched_rp,
                )
            )

    return lead_time_severities


def determine_alert_stations(
    station_lead_time_severities: list[TimeIntervalSeverity],
    station_code: str,
    station: LocationPoint,
) -> AlertStation:
    """
    Create an alert station from pre-computed lead time severities for one station.
    """
    
    alert_station = AlertStation(
        station_code=station_code,
        station=station,
        lead_time_severities=station_lead_time_severities,
    )
    logging.info(
        f"Station {station_code} alert for "
        f"{len(station_lead_time_severities)} lead time(s)"
    )
    return alert_station
