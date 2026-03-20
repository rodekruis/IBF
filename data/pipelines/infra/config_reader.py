from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


@dataclass
class DataSourceConfig:
    name: str
    type: str
    source: str


@dataclass
class CountryConfig:
    name: str
    data_sources: list[DataSourceConfig] = field(default_factory=list)
    output_mode: str = "local"
    output_path: str = "pipelines/output"


@dataclass
class ConfigReader:
    raw_config: dict | None = field(default=None, repr=False)
    errors: list[str] = field(default_factory=list)

    def load(self, path: str | Path) -> bool:
        path = Path(path)
        if not path.exists():
            self.errors.append(f"Config file not found: {path}")
            return False

        try:
            with open(path, "r", encoding="utf-8") as f:
                self.raw_config = yaml.safe_load(f)
        except yaml.YAMLError as exc:
            self.errors.append(f"Failed to parse YAML: {exc}")
            return False

        if not self._validate():
            return False

        return True

    def _validate(self) -> bool:
        if self.raw_config is None:
            self.errors.append("Config is empty")
            return False

        required_keys = ["hazard_type", "run_targets"]
        for key in required_keys:
            if key not in self.raw_config:
                self.errors.append(f"Missing required config key: '{key}'")

        if self.errors:
            return False
        return True

    def get_hazard_type(self) -> str:
        if self.raw_config is None:
            raise RuntimeError("Config not loaded")
        return self.raw_config["hazard_type"]

    def get_countries(self, run_target: str) -> list[CountryConfig]:
        if self.raw_config is None:
            raise RuntimeError("Config not loaded")

        run_targets = self.raw_config.get("run_targets", {})
        target_config = run_targets.get(run_target)
        if target_config is None:
            logger.warning(f"No config found for run_target '{run_target}'")
            return []

        countries = []
        for country_raw in target_config.get("countries", []):
            data_sources = []
            for src in country_raw.get("data_sources", []):
                data_sources.append(
                    DataSourceConfig(
                        name=src["name"],
                        type=src.get("type", "json"),
                        source=src.get("source", "dummy"),
                    )
                )

            output_raw = country_raw.get("output", {})
            countries.append(
                CountryConfig(
                    name=country_raw["name"],
                    data_sources=data_sources,
                    output_mode=output_raw.get("mode", "local"),
                    output_path=output_raw.get("path", "pipelines/output"),
                )
            )

        return countries

    def get_data_sources(
        self, country_name: str, run_target: str
    ) -> list[DataSourceConfig]:
        for country in self.get_countries(run_target):
            if country.name == country_name:
                return country.data_sources
        return []

    def get_output_config(self, country_name: str, run_target: str) -> dict[str, str]:
        for country in self.get_countries(run_target):
            if country.name == country_name:
                return {"mode": country.output_mode, "path": country.output_path}
        return {"mode": "local", "path": "pipelines/output"}
