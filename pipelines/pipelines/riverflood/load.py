from __future__ import annotations

import json
import csv
import logging
import os.path
import shutil
from datetime import datetime
from typing import List

import geopandas as gpd
from pipelines.core.data import AdminDataSet, RegionDataSet
from pipelines.core.load import Load
from pipelines.riverflood.data import (
    ThresholdDataUnit,
    ThresholdStationDataUnit,
    RiverFloodDataSets,
)

AREA_INDICATORS = [
    "population_affected",
    "population_affected_percentage",
    "forecast_severity",
    "forecast_trigger",
]

STATION_INDICATORS = [
    "forecastLevel",
    "eapAlertClass",
    "forecastReturnPeriod",
    "triggerLevel",
]


def alert_class_to_severity(alert_class: str, triggered: bool) -> float:
    """Convert alert class to 'forecast_severity'"""
    if alert_class == "no":
        return 0.0
    elif alert_class == "min":
        return 0.3
    elif alert_class == "med":
        return 0.7
    elif alert_class == "max":
        if triggered:
            return 1.0
        else:
            return 0.7
    else:
        raise ValueError(f"Invalid alert class {alert_class}")


class RiverFloodLoad(Load):
    """Download/upload data from/to a data storage"""

    def __init__(self, data: RiverFloodDataSets, **kwargs):
        super().__init__(**kwargs)
        self.data = data

        # load thresholds
        self.data.threshold_admin = self.get_thresholds_admin()
        self.data.threshold_station = self.get_thresholds_station()

    def get_stations(self) -> list[dict]:
        """Get GloFAS stations from IBF app"""
        stations = self.ibf_api_request(
            "GET",
            f"point-data/glofas_stations/{self.country}",
            parameters={
                "disasterType": "flood",
                "pointDataCategory": "glofas_stations",
                "countryCodeISO3": self.country,
            },
        )
        if stations is None:
            logging.warning(f"No station data found for country {self.country}")
            return []

        gdf_stations = gpd.GeoDataFrame.from_features(stations["features"])
        stations = []
        for _ix, row in gdf_stations.iterrows():
            station = {
                "stationCode": row["stationCode"],
                "stationName": row["stationName"],
                "lat": row["geometry"].y,
                "lon": row["geometry"].x,
            }
            stations.append(station)

        return stations

    def send_to_ibf_api(
        self,
        flood_extent: str = None,
        upload_time: str = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
    ):
        """Send flood forecast data to IBF API"""
        logging.info("send data to IBF API")

        events_json = []

        trigger_on_lead_time = self.settings.get_country_setting(
            self.country, "trigger-on-lead-time"
        )
        trigger_on_return_period = self.settings.get_country_setting(
            self.country, "trigger-on-return-period"
        )
        threshold_station_data = self.get_thresholds_station()

        processed_stations, processed_pcodes, triggered_lead_times = [], [], []

        # START EVENT LOOP
        for station_code in self.data.forecast_station.get_ids():

            # determine events
            events = {}
            for lead_time in range(0, 8):
                if (
                    self.data.forecast_station.get_data_unit(
                        station_code, lead_time
                    ).alert_class
                    != "no"
                ):
                    events[lead_time] = "alert"
            for lead_time in range(0, 8):
                if self.data.forecast_station.get_data_unit(
                    station_code, lead_time
                ).triggered:
                    events[lead_time] = "trigger"
                    triggered_lead_times.append(lead_time)
            if not events:
                continue
            events = dict(sorted(events.items()))
            last_event_type, last_event_lead_time = "", 0

            for lead_time_event, event_type in events.items():

                # set as alert if lead time is greater than trigger_on_lead_time
                if lead_time_event > trigger_on_lead_time and event_type == "trigger":
                    event_type = "alert"
                station_name = self.data.forecast_station.get_data_unit(
                    station_code, trigger_on_lead_time
                ).name
                event_name = str(station_name) if station_name else str(station_code)
                if event_name == "" or event_name == "None" or event_name == "Na":
                    event_name = str(station_code)

                # if already sent data for this event for a previous lead time, or severity is lower, break
                if (
                    event_type == last_event_type
                    or (last_event_type == "trigger" and event_type == "alert")
                ) and lead_time_event > last_event_lead_time:
                    break
                else:
                    last_event_type, last_event_lead_time = event_type, lead_time_event

                logging.info(
                    f"event {event_name}, type '{event_type}', lead time {lead_time_event}"
                )
                forecast_station = self.data.forecast_station.get_data_unit(
                    station_code, lead_time_event
                )
                threshold_station = threshold_station_data.get_data_unit(station_code)

                lead_time = f"{lead_time_event}-day"

                alert_areas = {}

                # send exposure data: admin-area-dynamic-data/exposure
                for indicator in AREA_INDICATORS:
                    for adm_level in forecast_station.pcodes.keys():
                        exposure_pcodes = []
                        for pcode in forecast_station.pcodes[adm_level]:

                            if pcode not in alert_areas:
                                alert_areas[pcode] = {"admin_level": int(adm_level)}

                            forecast_admin = self.data.forecast_admin.get_data_unit(
                                pcode, lead_time_event
                            )
                            amount = None
                            if indicator == "population_affected":
                                amount = forecast_admin.pop_affected
                            elif indicator == "population_affected_percentage":
                                amount = forecast_admin.pop_affected_perc
                            elif indicator == "forecast_severity":
                                amount = alert_class_to_severity(
                                    alert_class=forecast_admin.alert_class,
                                    triggered=(
                                        True if event_type == "trigger" else False
                                    ),
                                )
                            elif indicator == "forecast_trigger":
                                forecast_severity = alert_class_to_severity(
                                    alert_class=forecast_admin.alert_class,
                                    triggered=(
                                        True if event_type == "trigger" else False
                                    ),
                                )
                                # Currently (with high-warning not facilitated yet): set forecast_trigger to 1 exactly for those case where forecast_severity is 1
                                if event_type == "trigger" and forecast_severity == 1.0:
                                    amount = 1
                                else:
                                    amount = 0
                            exposure_pcodes.append(
                                {"placeCode": pcode, "amount": amount}
                            )
                            processed_pcodes.append(pcode)
                            alert_areas[pcode][indicator] = amount
                        body = {
                            "countryCodeISO3": self.country,
                            "leadTime": lead_time,
                            "dynamicIndicator": indicator,
                            "adminLevel": int(adm_level),
                            "exposurePlaceCodes": exposure_pcodes,
                            "disasterType": "floods",
                            "eventName": event_name,
                            "date": upload_time,
                        }
                        self.ibf_api_request(
                            "POST", "admin-area-dynamic-data/exposure", body=body
                        )
                processed_pcodes = list(set(processed_pcodes))

                glofas_stations = {}

                # GloFAS station data: point-data/dynamic
                # 1 call per alert/triggered station, and 1 overall (to same endpoint) for all other stations
                if event_type != "none":
                    station_forecasts = {key: [] for key in STATION_INDICATORS}
                    discharge_station = self.data.discharge_station.get_data_unit(
                        station_code, lead_time_event
                    )
                    for indicator in STATION_INDICATORS:
                        value = None
                        if indicator == "forecastLevel":
                            value = int(discharge_station.discharge_mean or 0)
                        elif indicator == "eapAlertClass":
                            value = forecast_station.alert_class
                            if event_type == "alert" and value == "max":
                                value = "med"
                        elif indicator == "forecastReturnPeriod":
                            value = forecast_station.return_period
                        elif indicator == "triggerLevel":
                            value = int(
                                threshold_station.get_threshold(
                                    trigger_on_return_period
                                )
                            )

                        if station_code not in glofas_stations:
                            glofas_stations[station_code] = {}

                        station_data = {"fid": station_code, "value": value}
                        station_forecasts[indicator].append(station_data)
                        glofas_stations[station_code][indicator] = value
                        body = {
                            "leadTime": lead_time,
                            "key": indicator,
                            "dynamicPointData": station_forecasts[indicator],
                            "pointDataCategory": "glofas_stations",
                            "disasterType": "floods",
                            "countryCodeISO3": self.country,
                            "date": upload_time,
                        }
                        self.ibf_api_request("POST", "point-data/dynamic", body=body)
                    processed_stations.append(station_code)

                events_json.append(
                    {
                        "event_name": event_name,
                        "date": upload_time,
                        "country": self.country,
                        "hazard": "flood",
                        "lead_time": lead_time,
                        "alert_areas": alert_areas,
                        "glofas_stations": glofas_stations,
                    }
                )

            # send alerts per lead time: event/alerts-per-lead-time
            alerts_per_lead_time = []
            for lead_time in range(0, 8):
                is_trigger, is_trigger_or_alert = False, False
                for lead_time_event, event_type in events.items():
                    if event_type == "trigger" and lead_time >= lead_time_event:
                        is_trigger = True
                    if (
                        event_type == "trigger" or event_type == "alert"
                    ) and lead_time >= lead_time_event:
                        is_trigger_or_alert = True
                alerts_per_lead_time.append(
                    {
                        "leadTime": f"{lead_time}-day",
                        "forecastAlert": is_trigger_or_alert,
                        "forecastTrigger": is_trigger,
                    }
                )
            body = {
                "countryCodeISO3": self.country,
                "alertsPerLeadTime": alerts_per_lead_time,
                "disasterType": "floods",
                "eventName": event_name,
                "date": upload_time,
            }
            self.ibf_api_request("POST", "event/alerts-per-lead-time", body=body)

        self.export_to_json_and_csv(events_json)

        # END OF EVENT LOOP
        ###############################################################################################################

        # flood extent raster: admin-area-dynamic-data/raster/floods
        for lead_time in range(0, 8):
            flood_extent_new = flood_extent.replace(
                ".tif", f"_{lead_time}-day_{self.country}.tif"
            )
            if lead_time in triggered_lead_times:
                shutil.copy(
                    flood_extent.replace(".tif", f"_{lead_time}.tif"), flood_extent_new
                )
            else:
                shutil.copy(
                    flood_extent.replace(".tif", f"_empty.tif"),
                    flood_extent_new,
                )
            files = {"file": open(flood_extent_new, "rb")}
            self.ibf_api_request(
                "POST", "admin-area-dynamic-data/raster/floods", files=files
            )

        # send empty exposure data
        if len(processed_pcodes) == 0:
            for indicator in AREA_INDICATORS:
                for adm_level in self.data.forecast_admin.adm_levels:
                    exposure_pcodes = []
                    for pcode in self.data.forecast_admin.get_pcodes(
                        adm_level=adm_level
                    ):
                        if pcode not in processed_pcodes:
                            amount = None
                            if indicator == "population_affected":
                                amount = 0
                            elif indicator == "population_affected_percentage":
                                amount = 0.0
                            elif indicator == "forecast_severity":
                                amount = 0.0
                            elif indicator == "forecast_trigger":
                                amount = 0.0
                            exposure_pcodes.append(
                                {"placeCode": pcode, "amount": amount}
                            )
                    body = {
                        "countryCodeISO3": self.country,
                        "leadTime": "1-day",  # this is a specific check IBF uses to establish no-trigger
                        "dynamicIndicator": indicator,
                        "adminLevel": adm_level,
                        "exposurePlaceCodes": exposure_pcodes,
                        "disasterType": "floods",
                        "eventName": None,  # this is a specific check IBF uses to establish no-trigger
                        "date": upload_time,
                    }
                    self.ibf_api_request(
                        "POST", "admin-area-dynamic-data/exposure", body=body
                    )

        # send GloFAS station data for all other stations
        station_forecasts = {key: [] for key in STATION_INDICATORS}
        for indicator in STATION_INDICATORS:
            for station_code in self.data.forecast_station.get_ids():
                if station_code not in processed_stations:
                    discharge_station = self.data.discharge_station.get_data_unit(
                        station_code, trigger_on_lead_time
                    )
                    forecast_station = self.data.forecast_station.get_data_unit(
                        station_code, trigger_on_lead_time
                    )
                    threshold_station = threshold_station_data.get_data_unit(
                        station_code
                    )
                    value = None
                    if indicator == "forecastLevel":
                        value = int(discharge_station.discharge_mean or 0)
                    elif indicator == "eapAlertClass":
                        value = forecast_station.alert_class
                    elif indicator == "forecastReturnPeriod":
                        value = forecast_station.return_period
                    elif indicator == "triggerLevel":
                        value = int(
                            threshold_station.get_threshold(trigger_on_return_period)
                        )
                    station_data = {"fid": station_code, "value": value}
                    station_forecasts[indicator].append(station_data)

            body = {
                "leadTime": f"7-day",
                "key": indicator,
                "dynamicPointData": station_forecasts[indicator],
                "pointDataCategory": "glofas_stations",
                "disasterType": "floods",
                "countryCodeISO3": self.country,
                "date": upload_time,
            }
            self.ibf_api_request("POST", "point-data/dynamic", body=body)

        # process events: events/process
        body = {
            "countryCodeISO3": self.country,
            "disasterType": "floods",
            "date": upload_time,
        }
        self.ibf_api_request("POST", "events/process", body=body)

    def get_thresholds_station(self):
        """Get GloFAS station thresholds from config file"""
        data_units = []

        resource_name = f"{self.country}_station_thresholds.json"
        file_path = os.path.join(self.data.input_dir, resource_name)

        if os.path.exists(file_path):
            logging.warning(f"file {file_path} exists, skipping")
        else:
            self.data.download_from_ckan(
                resource_name=resource_name, file_path=file_path
            )

        with open(file_path, "r") as read_file:
            station_thresholds = json.load(read_file)
            for station in station_thresholds:
                data_units.append(
                    ThresholdStationDataUnit(
                        _id=station["station_code"],
                        name=station["station_name"],
                        lat=station["lat"],
                        lon=station["lon"],
                        pcodes=station["pcodes"],
                        thresholds=station["thresholds"],
                    )
                )

        dataset = RegionDataSet(
            country=self.country,
            data_units=data_units,
        )

        return dataset

    def save_thresholds_station(self, data: List[ThresholdStationDataUnit]):
        """Save GloFAS station thresholds to config file"""
        # TBI validate before save
        resource_name = f"{self.country}_station_thresholds.json"
        file_path = os.path.join(self.data.input_dir, resource_name)
        with open(file_path, "w") as file:
            json.dump([record.__dict__ for record in data], file)

    def get_thresholds_admin(self):
        """Get GloFAS admin area thresholds from config file"""
        data_units = []

        resource_name = f"{self.country}_admin_thresholds.json"
        file_path = os.path.join(self.data.input_dir, resource_name)

        if os.path.exists(file_path):
            logging.warning(f"file {file_path} exists, skipping")
        else:
            self.data.download_from_ckan(
                resource_name=resource_name, file_path=file_path
            )

        with open(file_path, "r") as read_file:
            admin_thresholds = json.load(read_file)
            for record in admin_thresholds:
                data_units.append(
                    ThresholdDataUnit(
                        adm_level=record["adm_level"],
                        pcode=record["pcode"],
                        thresholds=record["thresholds"],
                    )
                )

        dataset = AdminDataSet(
            country=self.country,
            timestamp=datetime.now(),
            data_units=data_units,
        )

        return dataset

    def save_thresholds_admin(self, data: List[ThresholdDataUnit]):
        """Save GloFAS admin area thresholds to config file"""
        # TBI validate before save
        resource_name = f"{self.country}_admin_thresholds.json"
        file_path = os.path.join(self.data.input_dir, resource_name)
        with open(file_path, "w") as file:
            json.dump([record.__dict__ for record in data], file)

    def export_to_json_and_csv(self, events: list[dict]):
        with open(f"{self.data.output_dir}/events.json", "w") as f:
            json.dump(events, f, indent=2)

        with open(f"{self.data.output_dir}/events.csv", "w", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(["event_name", "date", "country", "hazard", "lead_time"])
            for event in events:
                writer.writerow(
                    [
                        event.get("event_name"),
                        event.get("date"),
                        event.get("country"),
                        event.get("hazard"),
                        event.get("lead_time"),
                    ]
                )

        with open(f"{self.data.output_dir}/alert-areas.csv", "w", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(
                [
                    "event_name",
                    "admin_level",
                    "place_code",
                ]
                + AREA_INDICATORS
            )
            for event in events:
                for place_code, alert_area in event.get("alert_areas", {}).items():
                    writer.writerow(
                        [
                            event.get("event_name"),
                            alert_area.get("admin_level"),
                            place_code,
                            *[
                                alert_area.get(indicator)
                                for indicator in AREA_INDICATORS
                            ],
                        ]
                    )

        with open(f"{self.data.output_dir}/glofas-stations.csv", "w", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(
                [
                    "event_name",
                    "glofas_station",
                ]
                + STATION_INDICATORS
            )

            for event in events:
                for station_code, station in event.get("glofas_stations", {}).items():
                    writer.writerow(
                        [
                            event.get("event_name"),
                            station_code,
                            *[
                                station.get(indicator)
                                for indicator in STATION_INDICATORS
                            ],
                        ]
                    )
