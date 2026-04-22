from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass
from typing import TypedDict

from pipelines.flood.extract_forecast_data import StationDischarges
from pipelines.infra.data_types.location_point import LocationPoint

MINIMUM_RETURN_PERIOD = "1.5yr"


@dataclass
class LeadTimeSeverity:
    time_interval_start: str
    time_interval_end: str
    median_discharge: float
    ensemble_discharges: list[float]
    return_period: str


@dataclass
class AlertStation:
    station_code: str
    station: LocationPoint
    lead_time_severities: list[LeadTimeSeverity]


class ReturnPeriodThresholdValue(TypedDict):
    return_period: float
    threshold_value: float


class ReturnPeriodThresholds(TypedDict):
    station_code: str
    thresholds: list[ReturnPeriodThresholdValue]


def _format_return_period_label(return_period: float) -> str:
    return f"{return_period:g}yr"


def _get_station_thresholds(
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


def determine_lead_time_severities(
    discharges: StationDischarges,
    thresholds: list[ReturnPeriodThresholds],
    minimum_return_period: str = MINIMUM_RETURN_PERIOD,
) -> dict[str, list[LeadTimeSeverity]]:
    """
    For each station, compute the lead time severities by comparing the median
    ensemble discharge against return period thresholds.
    Returns a mapping of station_code to lead time severities, only for stations
    with at least one lead time exceeding the minimum return period threshold.
    """
    result: dict[str, list[LeadTimeSeverity]] = {}

    for station_code, lead_times in discharges.items():
        station_thresholds = _get_station_thresholds(thresholds, station_code)
        if station_thresholds is None:
            logging.warning(
                f"No return period thresholds for station {station_code}, skipping"
            )
            continue

        if minimum_return_period not in station_thresholds:
            logging.warning(
                f"Return period '{minimum_return_period}' not found for station {station_code}, skipping"
            )
            continue

        lead_time_severities: list[LeadTimeSeverity] = []
        for lead_time_discharge in lead_times:
            if not lead_time_discharge.ensemble_discharges:
                continue
            median_discharge = statistics.median(
                lead_time_discharge.ensemble_discharges
            )
            matched_rp = _match_return_period(median_discharge, station_thresholds)
            if matched_rp is not None:
                lead_time_severities.append(
                    LeadTimeSeverity(
                        time_interval_start=lead_time_discharge.time_interval_start,
                        time_interval_end=lead_time_discharge.time_interval_end,
                        median_discharge=median_discharge,
                        ensemble_discharges=lead_time_discharge.ensemble_discharges,
                        return_period=matched_rp,
                    )
                )

        if lead_time_severities:
            result[station_code] = lead_time_severities

    return result


def determine_alert_stations(
    station_lead_time_severities: dict[str, list[LeadTimeSeverity]],
    stations: dict[str, LocationPoint],
) -> list[AlertStation]:
    """
    Create alert stations from pre-computed lead time severities.
    """
    alert: list[AlertStation] = []
    for station_code, lead_time_severities in station_lead_time_severities.items():
        station = stations.get(station_code)
        if station is None:
            logging.warning(
                f"Station {station_code} not found in stations dict, skipping"
            )
            continue
        alert.append(
            AlertStation(
                station_code=station_code,
                station=station,
                lead_time_severities=lead_time_severities,
            )
        )
        logging.info(
            f"Station {station_code} alert for "
            f"{len(lead_time_severities)} lead time(s)"
        )

    logging.info(
        f"{len(alert)} of {len(station_lead_time_severities)} stations created alert stations."
    )
    return alert
