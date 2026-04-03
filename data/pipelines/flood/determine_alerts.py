from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass

from pipelines.flood.extract_glofas_data import StationDischarges
from pipelines.infra.data_types.location_point import LocationPoint

MINIMUM_RETURN_PERIOD = "2yr"


@dataclass
class LeadTimeSeverity:
    lead_time: int
    median_discharge: float
    ensemble_discharges: list[float]
    # TODO: add probability?


@dataclass
class TriggeredStation:
    station_code: str
    station: LocationPoint
    lead_time_severities: list[LeadTimeSeverity]


# Thresholds keyed by station_code -> return_period label -> discharge value
ReturnPeriodThresholds = dict[str, dict[str, float]]


def determine_triggered_stations(
    discharges: StationDischarges,
    stations: dict[str, LocationPoint],
    thresholds: ReturnPeriodThresholds,
    minimum_return_period: str = MINIMUM_RETURN_PERIOD,
) -> list[TriggeredStation]:
    """Compare median ensemble discharge against the minimum return period threshold.

    A station triggers an alert if the median discharge for any lead time
    exceeds the threshold for the given return period.
    """
    triggered: list[TriggeredStation] = []

    for station_code, lead_times in discharges.items():
        if station_code not in thresholds:
            logging.warning(
                f"No return period thresholds for station {station_code}, skipping"
            )
            continue

        station_thresholds = thresholds[station_code]
        threshold_value = station_thresholds.get(minimum_return_period)
        if threshold_value is None:
            logging.warning(
                f"Return period '{minimum_return_period}' not found for station {station_code}, skipping"
            )
            continue

        triggered_lead_times: list[LeadTimeSeverity] = []
        for lead_time, ensemble_values in lead_times.items():
            if not ensemble_values:
                continue
            median_discharge = statistics.median(ensemble_values)
            if median_discharge > threshold_value:
                triggered_lead_times.append(
                    LeadTimeSeverity(
                        lead_time=lead_time,
                        median_discharge=median_discharge,
                        ensemble_discharges=ensemble_values,
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
