from __future__ import annotations

import logging
import os
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)

ALERTS_PATH = "/api/alerts"
ADMIN_AREAS_PATH = "/api/admin-areas"
ALERT_CONFIGS_PATH = "/api/alert-configs"


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
    ) -> list[dict]:
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
            return configs
        logger.error(
            f"Failed to download alert configs for {country_code_iso_3}/{hazard_type}: {response.status_code} {response.text}"
        )
        return []
