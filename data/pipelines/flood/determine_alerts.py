from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass
from typing import TypedDict

from pipelines.flood.extract_glofas_data import StationDischarges
from pipelines.infra.data_types.location_point import LocationPoint

MINIMUM_RETURN_PERIOD = "1.5yr"


@dataclass
class LeadTimeSeverity:
    lead_time: int
    median_discharge: float
    ensemble_discharges: list[float]
    return_period: str


@dataclass
class TriggeredStation:
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


def determine_triggered_stations(
    discharges: StationDischarges,
    stations: dict[str, LocationPoint],
    thresholds: list[ReturnPeriodThresholds],
    minimum_return_period: str = MINIMUM_RETURN_PERIOD,
) -> list[TriggeredStation]:
    """
    Compare median ensemble discharge against the minimum return period threshold.
    A station triggers an alert if the median discharge for any lead time
    exceeds the threshold for the given return period.
    """
    triggered: list[TriggeredStation] = []

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

        triggered_lead_times: list[LeadTimeSeverity] = []
        for lead_time, ensemble_values in lead_times.items():
            if not ensemble_values:
                continue
            median_discharge = statistics.median(ensemble_values)
            matched_rp = _match_return_period(median_discharge, station_thresholds)
            if matched_rp is not None:
                triggered_lead_times.append(
                    LeadTimeSeverity(
                        lead_time=lead_time,
                        median_discharge=median_discharge,
                        ensemble_discharges=ensemble_values,
                        return_period=matched_rp,
                    )
                )

        if triggered_lead_times:
            station = stations.get(station_code)
            if station is None:
                logging.warning(
                    f"Station {station_code} not found in stations dict, skipping"
                )
                continue
            triggered.append(
                TriggeredStation(
                    station_code=station_code,
                    station=station,
                    lead_time_severities=triggered_lead_times,
                )
            )
            logging.info(
                f"Station {station_code} triggered for "
                f"{len(triggered_lead_times)} lead time(s)"
            )

    logging.info(
        f"{len(triggered)} of {len(discharges)} stations exceeded "
        f"the {minimum_return_period} threshold"
    )
    return triggered
