from __future__ import annotations

import logging
import os
from urllib.parse import urlencode

import requests
from pipelines.infra.data_types.enums import MapLayer
from pipelines.infra.data_types.loaded_data_types import AlertConfig
from pipelines.infra.data_types.location_point import LocationPoint

logger = logging.getLogger(__name__)

ALERTS_PATH = "/api/alerts"
ADMIN_AREAS_PATH = "/api/admin-areas"
ALERT_CONFIGS_PATH = "/api/alert-configs"
GEO_FEATURES_PATH = "/api/geo-features"
STATIC_RASTERS_PATH = "/api/rasters/static"


class ApiClient:
    def __init__(self) -> None:
        base_url = os.environ.get("IBF_API_URL", "")
        if not base_url:
            raise ValueError("IBF_API_URL environment variable must be set")

        api_key = os.environ.get("IBF_PIPELINE_API_KEY", "")
        if not api_key:
            raise ValueError("IBF_PIPELINE_API_KEY environment variable must be set")

        self._base_url = base_url.rstrip("/")
        self._session = requests.Session()

        self._session.headers["x-api-key"] = api_key

    def submit_forecast(self, forecast: dict) -> list[str]:
        url = f"{self._base_url}{ALERTS_PATH}"
        response = self._session.post(
            url,
            json=forecast,
            timeout=60,
        )

        if response.status_code == 201:
            logger.info(f"Forecast submitted to '{url}'")
            return []

        try:
            body = response.json()
            errors = body.get("errors", [body.get("message", str(body))])
        except Exception:
            errors = [f"API returned {response.status_code}: {response.text}"]

        for err in errors:
            logger.error(f"API error: {err}")
        return errors

    def get_admin_areas(
        self, country_code_iso_3: str, admin_level: int | None = None
    ) -> dict:
        url = f"{self._base_url}{ADMIN_AREAS_PATH}"
        cql_filter = f"countryCodeIso3='{country_code_iso_3}'"
        if admin_level is not None:
            cql_filter += f" AND adminLevel={admin_level}"
        params = {"filter": cql_filter}
        logger.info(f"Download '{url}?{urlencode(params)}'")
        response = self._session.get(url, params=params, timeout=30)
        if response.status_code == 200:
            feature_collection = response.json()
            features = feature_collection.get("features", [])
            if not features:
                logger.warning(f"Downloaded 0 admin areas for {country_code_iso_3}")
            return feature_collection
        logger.error(
            f"Failed to download admin areas for {country_code_iso_3}: {response.status_code} {response.text}"
        )
        return {}

    def get_alert_configs(
        self, country_code_iso_3: str, hazard_type: str
    ) -> list[AlertConfig]:
        url = f"{self._base_url}{ALERT_CONFIGS_PATH}"
        params: dict = {
            "countryCodeIso3": country_code_iso_3,
            "hazardType": hazard_type,
        }
        logger.info(f"Download '{url}?{urlencode(params)}'")
        response = self._session.get(url, params=params, timeout=30)
        if response.status_code == 200:
            configs = response.json()
            if not configs:
                logger.warning(
                    f"Downloaded 0 alert configs for {country_code_iso_3}/{hazard_type}"
                )
            return [AlertConfig.from_api(item) for item in configs]
        logger.error(
            f"Failed to download alert configs for {country_code_iso_3}/{hazard_type}: {response.status_code} {response.text}"
        )
        return []

    def get_geo_features(self, country_code_iso_3: str, map_layer: str) -> list[dict]:
        url = f"{self._base_url}{GEO_FEATURES_PATH}"
        cql_filter = (
            f"countryCodeIso3='{country_code_iso_3}' AND mapLayer='{map_layer}'"
        )
        params = {"filter": cql_filter}
        logger.info(f"Download '{url}?{urlencode(params)}'")
        response = self._session.get(url, params=params, timeout=30)
        if response.status_code == 200:
            feature_collection = response.json()
            features = feature_collection.get("features", [])
            if not features:
                logger.warning(
                    f"Downloaded 0 geo-features for {country_code_iso_3}/{map_layer}"
                )
            return features
        logger.error(
            f"Failed to download geo-features for {country_code_iso_3}/{map_layer}: {response.status_code} {response.text}"
        )
        return []

    def get_glofas_stations(self, country_code_iso_3: str) -> dict[str, LocationPoint]:
        data = self.get_geo_features(country_code_iso_3, MapLayer.GLOFAS_STATIONS)
        stations: dict[str, LocationPoint] = {}
        for feature in data:
            properties = feature.get("properties", {})
            geometry = feature.get("geometry", {})
            attributes = properties.get("attributes", {})
            station = LocationPoint(
                name=attributes.get("name", ""),
                lat=geometry["coordinates"][1],
                lon=geometry["coordinates"][0],
                id=properties["referenceId"],
                attributes=attributes,
            )
            stations[station.id] = station
        return stations

    def get_static_raster_metadata(
        self, country_code_iso_3: str, map_layer: str
    ) -> dict | None:
        url = f"{self._base_url}{STATIC_RASTERS_PATH}/{country_code_iso_3}/{map_layer}"
        logger.info(f"Download '{url}'")
        response = self._session.get(url, timeout=30)
        if response.status_code == 200:
            return response.json()
        logger.error(
            f"Failed to download static raster metadata for {country_code_iso_3}/{map_layer}: {response.status_code} {response.text}"
        )
        return None

    def get_static_raster_data_image(
        self, country_code_iso_3: str, map_layer: str
    ) -> bytes | None:
        url = f"{self._base_url}{STATIC_RASTERS_PATH}/{country_code_iso_3}/{map_layer}/data"
        logger.info(f"Download '{url}'")
        response = self._session.get(url, timeout=60)
        if response.status_code == 200:
            return response.content
        logger.error(
            f"Failed to download static raster data image for {country_code_iso_3}/{map_layer}: {response.status_code} {response.text}"
        )
        return None
