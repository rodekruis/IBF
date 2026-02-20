from __future__ import annotations

import copy
import csv
import json
import logging
import shutil
from datetime import datetime

import azure.cosmos.cosmos_client as cosmos_client
import cdsapi
import geopandas as gpd
import requests
from azure.core.exceptions import ResourceNotFoundError
from azure.storage.blob import BlobServiceClient
from pipelines.core.data import (
    AdminDataSet,
    AdminDataUnit,
    RegionDataSet,
    RegionDataUnit,
)
from pipelines.drought.data import DroughtDataSets
from pipelines.core.load import Load
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

COSMOS_DATA_TYPES = [
    "climate-region",
    "seasonal-rainfall-forecast",
    "seasonal-rainfall-forecast-climate-region",
]

AREA_INDICATORS = [
    "population_affected",
    "forecast_severity",
    "forecast_trigger",
]


def get_cosmos_query(
    start_date=None,
    end_date=None,
    country=None,
    adm_level=None,
    climate_region_code=None,
    pcode=None,
    lead_time=None,
):
    query = "SELECT * FROM c WHERE "
    if start_date is not None:
        query += f'c.timestamp >= "{start_date.strftime("%Y-%m-%dT%H:%M:%S")}" '
    if end_date is not None:
        query += f'AND c.timestamp <= "{end_date.strftime("%Y-%m-%dT%H:%M:%S")}" '
    if country is not None:
        query += f'AND c.country = "{country}" '
    if adm_level is not None:
        query += f'AND c.adm_level = "{adm_level}" '
    if climate_region_code is not None:
        query += f'AND c.climate_region_code = "{climate_region_code}" '
    if pcode is not None:
        query += f'AND c.adm_level = "{pcode}" '
    if lead_time is not None:
        query += f'AND c.adm_level = "{lead_time}" '
    if query.endswith("WHERE "):
        query = query.replace("WHERE ", "")
    query = query.replace("WHERE AND", "WHERE")
    return query


def get_data_unit_id(data_unit: AdminDataUnit, dataset: AdminDataSet):
    """Get data unit ID"""
    if hasattr(data_unit, "pcode") and getattr(data_unit, "pcode") is not None:
        if hasattr(data_unit, "lead_time"):
            id_ = f"{data_unit.pcode}_{dataset.timestamp.strftime('%Y-%m-%dT%H:%M:%S')}_{data_unit.lead_time}"
        else:
            id_ = f"{data_unit.pcode}_{dataset.timestamp.strftime('%Y-%m-%dT%H:%M:%S')}"
    elif hasattr(data_unit, "climate_region_code"):
        if hasattr(data_unit, "lead_time"):
            id_ = f"{data_unit.climate_region_code}_{dataset.timestamp.strftime('%Y-%m-%dT%H:%M:%S')}_{data_unit.lead_time}"
        else:
            id_ = f"{data_unit.climate_region_code}_{dataset.timestamp.strftime('%Y-%m-%dT%H:%M:%S')}"
    else:
        id_ = f"{dataset.timestamp.strftime('%Y-%m-%dT%H:%M:%S')}"
    return id_


def forecast_trigger_status(triggered: bool, trigger_class: str):
    """determine if forecast is a trigger for IBF portal if trigger status is true and trigger activation is enabled in config file the
    trigger staus will be 1 , else 0"""
    if triggered:
        if trigger_class == "enabled":
            return 1
        else:
            return 0
    else:
        return 0


class DroughtLoad(Load):
    """Download/upload data from/to a data storage"""

    def __init__(self, data: DroughtDataSets, **kwargs):
        super().__init__(data=data, **kwargs)
        self.data = data

        # load thresholds
        self.data.threshold_climateregion = self.get_pipeline_data(
            data_type="climate-region", country=self.country
        )

    def send_to_ibf_api(
        self,
        forecast_data: AdminDataSet,
        threshold_climateregion: RegionDataSet,
        forecast_climateregion: RegionDataSet,
        drought_extent: str = None,
        upload_time: datetime = datetime.now(),
    ):
        """Send drought forecast data to IBF API"""
        logging.info("send data to IBF API")

        events_json = []

        country = forecast_data.country
        # trigger_on_lead_time = self.settings.get_country_setting( country, "trigger-on-lead-time"    )
        admin_levels = self.settings.get_country_setting(country, "admin-levels")
        pipeline_will_trigger_portal = self.settings.get_country_setting(
            country, "pipeline-will-trigger-portal"
        )  # TODO: make varname more descriptive
        climate_regions_settings = self.settings.get_country_setting(
            country, "climate_region"
        )

        processed_pcodes = []

        upload_time_str = datetime.today().strftime(
            f"{upload_time.year}-{upload_time.month:02}-%dT%H:%M:%SZ"
        )
        all_possible_lead_times = []

        for climate_region_code in forecast_climateregion.get_ids():
            climateregion = threshold_climateregion.get_data_unit(
                _id=climate_region_code
            )
            pcodes = climateregion.pcodes

            # get possible event and lead times for this climate region and current month;
            # here we exclude events in-season, i.e. with 0-month lead time if they were also 0-month last month,
            # because exposure data must not be updated during the season
            possible_events_and_leadtimes = self.get_events_and_leadtimes(
                climate_regions_settings, climate_region_code, upload_time
            )
            possible_lead_times = list(possible_events_and_leadtimes.values())
            all_possible_lead_times.extend(possible_lead_times)

            # get lead_times with alert or trigger
            lead_times_with_alert_or_trigger = []
            for lead_time in range(0, 6):
                forecast = forecast_climateregion.get_data_unit(
                    climate_region_code, lead_time
                )
                if forecast.alert_class != "no" or forecast.triggered:
                    lead_times_with_alert_or_trigger.append(lead_time)

            for lead_time_event in range(0, 4):
                # NOTE: here we are assuming we will not expect two events in a climate region  with the same lead time
                if (
                    lead_time_event in possible_lead_times
                    and lead_time_event in lead_times_with_alert_or_trigger
                ):
                    lead_time = f"{lead_time_event}-month"

                    alert_areas = {}

                    season_name = next(
                        (
                            k
                            for k, v in possible_events_and_leadtimes.items()
                            if v == lead_time_event
                        ),
                        None,
                    )

                    if climateregion.name.lower().split("_")[0] == "national":
                        event_name = f"{season_name}_National"
                    else:
                        event_name = (
                            f"{climateregion.name} {season_name}_{climateregion.name}"
                        )

                    for indicator in AREA_INDICATORS:
                        for adm_level in admin_levels:
                            exposure_pcodes = []
                            for pcode in pcodes[
                                str(adm_level)  # TODO: check if str cast is needed
                            ]:
                                forecast_admin = forecast_data.get_data_unit(
                                    pcode=pcode, lead_time=lead_time_event
                                )

                                if pcode not in alert_areas:
                                    alert_areas[pcode] = {"admin_level": int(adm_level)}

                                amount = None
                                if indicator == "population_affected":
                                    amount = forecast_admin.pop_affected
                                elif indicator == "population_affected_percentage":
                                    amount = forecast_admin.pop_affected_perc
                                elif indicator == "forecast_severity":
                                    amount = forecast_admin.triggered
                                elif indicator == "forecast_trigger":
                                    amount = forecast_trigger_status(
                                        triggered=forecast_admin.triggered,
                                        trigger_class=pipeline_will_trigger_portal,
                                    )
                                exposure_pcodes.append(
                                    {"placeCode": pcode, "amount": amount}
                                )
                                processed_pcodes.append(pcode)
                                alert_areas[pcode][indicator] = amount

                            body = {
                                "countryCodeISO3": country,
                                "leadTime": lead_time,
                                "dynamicIndicator": indicator,
                                "adminLevel": int(adm_level),
                                "exposurePlaceCodes": exposure_pcodes,
                                "disasterType": self.hazard,
                                "eventName": event_name,
                                "date": upload_time_str,
                            }
                            statsPath = drought_extent.replace(
                                ".tif",
                                f"_{event_name}_{lead_time}_{country}_{adm_level}.json",
                            )
                            statsPath = statsPath.replace(
                                "rainfall_forecast", f"{indicator}"
                            )

                            with open(statsPath, "w") as fp:
                                json.dump(body, fp)

                            self.ibf_api_request(
                                "POST", "admin-area-dynamic-data/exposure", body=body
                            )
                    processed_pcodes = list(set(processed_pcodes))

                    events_json.append(
                        {
                            "event_name": event_name,
                            "date": upload_time,
                            "country": self.country,
                            "hazard": "flood",
                            "lead_time": lead_time,
                            "alert_areas": alert_areas,
                        }
                    )

        self.export_to_json_and_csv(events_json)

        # END OF EVENT LOOP
        ###############################################################################################################

        # drought extent raster: admin-area-dynamic-data/raster/droughts
        self.rasters_sent = []

        for lead_time in range(0, 4):
            # NOTE: new drought extent raster is updated during the season
            drought_extent_new = drought_extent.replace(
                ".tif", f"_{lead_time}-month_{country}.tif"
            )

            # to accompdate file name requirement in IBF portal
            rainf_extent = drought_extent_new.replace(
                "rainfall_forecast", "rlower_tercile_probability"
            )
            rain_rp = drought_extent_new.replace("rainfall_forecast", "rain_rp")
            shutil.copy(
                rainf_extent, drought_extent_new.replace("rainfall_forecast", "rain_rp")
            )
            self.rasters_sent.append(rain_rp)
            files = {"file": open(rain_rp, "rb")}
            self.ibf_api_request(
                "POST", "admin-area-dynamic-data/raster/drought", files=files
            )

        # send empty exposure data
        if len(processed_pcodes) == 0:
            logging.info(f"send empty exposure data")
            for lead_time in set(all_possible_lead_times):
                for indicator in AREA_INDICATORS:
                    for adm_level in admin_levels:
                        exposure_pcodes = []
                        for pcode in forecast_data.get_pcodes(adm_level=adm_level):
                            if pcode not in processed_pcodes:
                                amount = None
                                if indicator == "population_affected":
                                    amount = 0
                                elif indicator == "population_affected_percentage":
                                    amount = 0.0
                                elif indicator == "forecast_trigger":
                                    amount = 0
                                elif indicator == "forecast_severity":
                                    amount = 0
                                exposure_pcodes.append(
                                    {"placeCode": pcode, "amount": amount}
                                )
                        body = {
                            "countryCodeISO3": country,
                            "leadTime": f"{lead_time}-month",  #  "1-day",  # this is a specific check IBF uses to establish no-trigger
                            "dynamicIndicator": indicator,
                            "adminLevel": adm_level,
                            "exposurePlaceCodes": exposure_pcodes,
                            "disasterType": self.hazard,
                            "eventName": None,  # this is a specific check IBF uses to establish no-trigger
                            "date": upload_time_str,
                        }
                        self.ibf_api_request(
                            "POST", "admin-area-dynamic-data/exposure", body=body
                        )

                        statsPath = drought_extent.replace(
                            ".tif",
                            f"_null_{lead_time}-month_{country}_{adm_level}.json",
                        )
                        statsPath = statsPath.replace(
                            "rainfall_forecast", f"{indicator}"
                        )

                        with open(statsPath, "w") as fp:
                            json.dump(body, fp)

        # send notification
        body = {
            "countryCodeISO3": country,
            "disasterType": self.hazard,
            "date": upload_time_str,
        }

        self.ibf_api_request("POST", "events/process", body=body)

    def get_pipeline_data(
        self,
        data_type,
        country,
        start_date=None,
        end_date=None,
        adm_level=None,
        pcode=None,
        lead_time=None,
    ) -> RegionDataSet:
        """Download pipeline datasets from Cosmos DB"""
        if data_type not in COSMOS_DATA_TYPES:
            raise ValueError(
                f"Data type {data_type} is not supported."
                f"Supported storages are {', '.join(COSMOS_DATA_TYPES)}"
            )
        client_ = cosmos_client.CosmosClient(
            self.secrets.get_secret("COSMOS_URL"),
            {"masterKey": self.secrets.get_secret("COSMOS_KEY")},
            user_agent="ibf-flood-pipeline",
            user_agent_overwrite=True,
        )
        cosmos_db = client_.get_database_client("drought-pipeline")
        cosmos_container_client = cosmos_db.get_container_client(data_type)
        query = get_cosmos_query(
            start_date, end_date, country, adm_level, pcode, lead_time
        )
        records_query = cosmos_container_client.query_items(
            query=query,
            enable_cross_partition_query=(
                True if country is None else None
            ),  # country must be the partition key
        )
        records = []
        for record in records_query:
            records.append(copy.deepcopy(record))
        datasets = []
        countries = list(set([record["country"] for record in records]))
        timestamps = list(set([record["timestamp"] for record in records]))
        for country in countries:
            for timestamp in timestamps:
                data_units = []
                for record in records:
                    if (
                        record["country"] == country
                        and record["timestamp"] == timestamp
                    ):
                        if data_type == "climate-region":
                            data_unit = RegionDataUnit(
                                adm_level=record["adm_level"],
                                _id=record["climate_region_code"],
                                name=record["climate_region_name"],
                                pcodes=record["pcodes"],
                            )
                        else:
                            raise ValueError(f"Invalid data type {data_type}")
                        data_units.append(data_unit)
                    dataset = RegionDataSet(
                        country=country,
                        timestamp=timestamp,
                        data_units=data_units,
                    )
                    datasets.append(dataset)
        if len(datasets) == 0:
            raise KeyError(
                f"No datasets of type '{data_type}' found for country {country} in date range "
                f"{start_date} - {end_date}."
            )
        elif len(datasets) > 1:
            logging.warning(
                f"Multiple datasets of type '{data_type}' found for country {country} in date range "
                f"{start_date} - {end_date}; returning the latest (timestamp {datasets[-1].timestamp}). "
            )
        return datasets[-1]

    def get_events_and_leadtimes(
        self, climate_regions_settings, climate_region_code, upload_time
    ):
        """Get valid events and lead times for a given climate region and month.
        Exclude events in-season, i.e. with 0-month lead time if they were also 0-month last month.
        """
        valid_events_and_leadtimes = {}  # dict of season_name: lead_time

        current_month_abb = upload_time.strftime("%b")
        # Calculate last month
        if upload_time.month == 1:
            # If it's January, last month is December of the previous year
            last_month = upload_time.replace(year=upload_time.year - 1, month=12)
        else:
            last_month = upload_time.replace(month=upload_time.month - 1)
        last_month_abb = last_month.strftime("%b")

        events_and_leadtimes = self.get_events_and_leadtimes_by_region_and_month(
            climate_regions_settings, climate_region_code, current_month_abb
        )
        event_leadtimes_last_month = self.get_events_and_leadtimes_by_region_and_month(
            climate_regions_settings, climate_region_code, last_month_abb
        )

        for record in events_and_leadtimes:
            for season, lead_time in record.items():
                if lead_time != "0-month" or (
                    lead_time == "0-month"
                    and next(
                        c for c in event_leadtimes_last_month if season in c.keys()
                    )[season]
                    != "0-month"
                ):
                    valid_events_and_leadtimes[season] = int(lead_time.split("-")[0])

        return valid_events_and_leadtimes

    def get_events_and_leadtimes_by_region_and_month(
        self, climate_regions_settings, climate_region_code, month_abb
    ):
        return next(
            (
                cr
                for cr in climate_regions_settings
                if cr["climate-region-code"] == climate_region_code
            )
        )["leadtime"][month_abb]

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
