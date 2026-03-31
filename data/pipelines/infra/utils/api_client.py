from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

ALERTS_PATH = "/api/alerts"


class ApiClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._session = requests.Session()

        api_key = os.environ.get("IBF_PIPELINE_API_KEY", "")
        if not api_key:
            raise ValueError("IBF_PIPELINE_API_KEY environment variable must be set")
        self._session.headers["x-api-key"] = api_key

    def submit_alerts(self, alerts: list[dict]) -> list[str]:
        url = f"{self._base_url}{ALERTS_PATH}"
        response = self._session.post(
            url,
            json={"alerts": alerts},
            timeout=60,
        )

        if response.status_code == 201:
            logger.info(f"Submitted {len(alerts)} alerts successfully")
            return []

        try:
            body = response.json()
            errors = body.get("errors", [body.get("message", str(body))])
        except Exception:
            errors = [f"API returned {response.status_code}: {response.text}"]

        for err in errors:
            logger.error(f"API error: {err}")
        return errors
