from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

ALERTS_PATH = "/api/alerts"
ADMIN_AREAS_PATH = "/api/admin-areas"


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
            logger.info("Submitted forecast successfully")
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
    ) -> list:
        url = f"{self._base_url}{ADMIN_AREAS_PATH}"
        params: dict = {"countryCodeIso3": country_code_iso_3}
        if admin_level is not None:
            params["adminLevel"] = admin_level
        response = self._session.get(url, params=params, timeout=30)
        if response.status_code == 200:
            level_str = (
                f"admin level {admin_level}"
                if admin_level is not None
                else "all admin levels"
            )
            logger.info(
                f"Fetched admin areas for {country_code_iso_3} {level_str} successfully"
            )
            return response.json()
        logger.error(
            f"Failed to fetch admin areas for {country_code_iso_3}: {response.status_code} {response.text}"
        )
        return []
