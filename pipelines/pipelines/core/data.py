import logging
import os
from datetime import datetime
from typing import List

import requests
from ckanapi import RemoteCKAN
from pipelines.core.secrets import Secrets


class AdminDataUnit:
    """Base class for administrative division data"""

    def __init__(self, **kwargs):
        self.adm_level: int = kwargs.get("adm_level")
        self.pcode: str = kwargs.get("pcode")
        self.lead_time: int = kwargs.get("lead_time", None)


class RegionDataUnit:
    """Base class for region data; a region is a collection of administrative divisions of the same administrative
    level, e.g. those intersecting a river basin or a climate zone
    """

    def __init__(self, **kwargs):
        self._id: str = kwargs.get("_id")
        self.name: str = kwargs.get("name")
        self.adm_level: int = kwargs.get(
            "adm_level"
        )  # admin level of associated administrative divisions
        self.pcodes: dict = kwargs.get(
            "pcodes"
        )  # pcodes of associated administrative divisions
        self.lead_time: int = kwargs.get("lead_time", None)


class AdminDataSet:
    """Base class for AdminDataSet, i.e. a collection of AdminDataUnits"""

    def __init__(
        self,
        country: str = None,
        timestamp: datetime = datetime.now(),
        adm_levels: List[int] = None,
        data_units: List[AdminDataUnit] = None,
    ):
        self.country = country
        self.timestamp = timestamp
        self.data_units = data_units
        if not adm_levels and data_units and len(data_units) > 0:
            self.adm_levels = list(
                set([data_unit.adm_level for data_unit in data_units])
            )
        else:
            self.adm_levels = adm_levels

    def get_pcodes(self, adm_level: int = None):
        """Return list of unique pcodes, optionally filtered by adm_level"""
        if not adm_level:
            return list(set([x.pcode for x in self.data_units]))
        else:
            return list(
                set([x.pcode for x in self.data_units if x.adm_level == adm_level])
            )

    def get_lead_times(self):
        """Return list of unique lead times"""
        return list(set([x.lead_time for x in self.data_units]))

    def get_data_units(self, lead_time: int = None, adm_level: int = None):
        """Return list of data units filtered by lead time and/or admin level"""
        if not self.data_units:
            raise ValueError("Data units not found")
        if lead_time is not None and adm_level is not None:
            return list(
                filter(
                    lambda x: x.lead_time == lead_time and x.adm_level == adm_level,
                    self.data_units,
                )
            )
        elif lead_time is not None:
            return list(filter(lambda x: x.lead_time == lead_time, self.data_units))
        elif adm_level is not None:
            return list(filter(lambda x: x.adm_level == adm_level, self.data_units))
        else:
            return self.data_units

    def get_data_unit(self, pcode: str, lead_time: int = None) -> AdminDataUnit:
        """Get data unit by pcode and optionally by lead time"""
        if not self.data_units:
            raise ValueError("Data units not found")
        if lead_time is not None:
            bdu = next(
                filter(
                    lambda x: x.pcode == pcode and x.lead_time == lead_time,
                    self.data_units,
                ),
                None,
            )
        else:
            bdu = next(
                filter(lambda x: x.pcode == pcode, self.data_units),
                None,
            )
        if not bdu:
            raise ValueError(
                f"Data unit with pcode {pcode} and lead_time {lead_time} not found"
            )
        else:
            return bdu

    def upsert_data_unit(self, data_unit: AdminDataUnit):
        """Add data unit; if it already exists, update it"""
        if not self.data_units:
            self.data_units = [data_unit]
        if hasattr(data_unit, "lead_time"):
            bdu = next(
                filter(
                    lambda x: x[1].pcode == data_unit.pcode
                    and x[1].lead_time == data_unit.lead_time,
                    enumerate(self.data_units),
                ),
                None,
            )
        else:
            bdu = next(
                filter(
                    lambda x: x[1].pcode == data_unit.pcode,
                    enumerate(self.data_units),
                ),
                None,
            )
        if not bdu:
            self.data_units.append(data_unit)
        else:
            self.data_units[bdu[0]] = data_unit


class RegionDataSet:
    """Base class for RegionDataSet, i.e. a collection of RegionDataUnits"""

    def __init__(
        self,
        country: str = None,
        timestamp: datetime = datetime.now(),
        adm_levels: List[int] = None,
        data_units: List[RegionDataUnit] = None,
    ):
        self.country = country
        self.timestamp = timestamp
        self.data_units = data_units
        if not adm_levels and data_units and len(data_units) > 0:
            self.adm_levels = list(
                set([data_unit.adm_level for data_unit in data_units])
            )
        else:
            self.adm_levels = adm_levels

    def get_data_unit(self, _id: str, lead_time: int = None) -> RegionDataUnit:
        """Get data unit by id"""
        if not self.data_units:
            raise ValueError("Data units not found")
        if lead_time:
            bdu = next(
                filter(
                    lambda x: x._id == _id and x.lead_time == lead_time,
                    self.data_units,
                ),
                None,
            )
        else:
            bdu = next(
                filter(lambda x: x._id == _id, self.data_units),
                None,
            )
        if not bdu:
            raise ValueError(
                f"Data unit with ID {_id} and lead_time {lead_time} not found"
            )
        else:
            return bdu

    def upsert_data_unit(self, data_unit: RegionDataUnit):
        """Add data unit; if it already exists, update it"""
        if not self.data_units:
            self.data_units = [data_unit]
        if hasattr(data_unit, "lead_time"):
            bdu = next(
                filter(
                    lambda x: x[1]._id == data_unit._id
                    and x[1].lead_time == data_unit.lead_time,
                    enumerate(self.data_units),
                ),
                None,
            )
        else:
            bdu = next(
                filter(
                    lambda x: x[1]._id == data_unit._id,
                    enumerate(self.data_units),
                ),
                None,
            )
        if not bdu:
            self.data_units.append(data_unit)
        else:
            self.data_units[bdu[0]] = data_unit

    def get_lead_times(self):
        """Return list of unique lead times"""
        return list(set([x.lead_time for x in self.data_units]))

    def get_ids(self):
        """Return list of ids"""
        return list(set([x._id for x in self.data_units]))


class DataSets:
    """Base class for datasets"""

    def __init__(self, country: str, secrets: Secrets):
        self.country = country
        self.secrets = secrets
        self.data_dir = "data"
        self.input_dir = os.path.join(self.data_dir, "input")
        self.output_dir = os.path.join(self.data_dir, "output")
        os.makedirs(self.input_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)

    def download_from_ckan(self, resource_name: str, file_path: str):
        """Download file from CKAN"""
        logging.info(f"downloading CKAN resource {resource_name} to {file_path}")

        ckan_url = self.secrets.get_secret("CKAN_URL")
        ckan_key = self.secrets.get_secret("CKAN_KEY")

        ckan = RemoteCKAN(ckan_url, apikey=ckan_key)
        package = ckan.action.package_show(id="ibf-datasets")

        # find resource by name
        resource = next(
            filter(lambda x: x["name"] == resource_name, package["resources"]), None
        )

        # if resource not found, raise error
        if not resource:
            logging.error(f"Resource {resource_name} not found")
            raise ValueError(f"Resource {resource_name} not found")

        source = resource["download_url"]

        # if file_path is a directory, add filename to path
        if os.path.isdir(file_path):
            filename = os.path.basename(source)
            file_path = os.path.join(file_path, filename)

        headers = {}
        headers["X-CKAN-API-Key"] = ckan_key
        headers["Authorization"] = ckan_key

        response = requests.get(source, headers=headers)
        response.raise_for_status()  # raise an error for bad responses

        with open(file_path, "wb") as f:
            f.write(response.content)
