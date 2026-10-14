"""Manual flood check: does every configured flood station produce a valid alert?

What: runs the flood pipeline logic once per alert config (station) of every configured country,
with simulated GloFAS discharge forced above the station's thresholds.
The regular mock run (``uv run pipeline --mock 1``) uses only one seeded discharge file per country.
This sweep exercises all stations, to catch potential data edge cases (e.g. flood extent without population)
that otherwise only show up when that specific station alerts in production.

Usage (from the data directory, with the local API running):
    uv run python pipelines/test/manual_checks/flood_station_sweep.py [--country ETH] [--return-period 10]
Add ``--output-mode api`` to also post one forecast per country with the alerts of all valid stations to the local API.
The report and per-station forecast.json files are written under pipelines/output, and decoded population rasters are cached under data/.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from collections.abc import Iterable, Sequence
from dataclasses import replace
from datetime import datetime, timedelta, UTC
from functools import partial
from pathlib import Path
from typing import cast
from unittest.mock import patch

import numpy as np
from dotenv import load_dotenv
from pipelines.flood import forecast as flood_forecast
from pipelines.flood.constants import GLOFAS_MIN_ENSEMBLE_COUNT
from pipelines.flood.determine_alerts import ReturnPeriodThresholdValue
from pipelines.flood.extract_forecast import TimeIntervalDischarge
from pipelines.infra.config_reader import ConfigReader
from pipelines.infra.data_provider import DataProvider
from pipelines.infra.data_submitter import DataSubmitter
from pipelines.infra.data_types.admin_area_types import AdminAreasSet
from pipelines.infra.data_types.data_config_types import (
    CountryRunConfig,
    DataSource,
    DataSourceConfig,
    OutputMode,
    RunOrigin,
    SourceTarget,
)
from pipelines.infra.data_types.dtos import ForecastSource
from pipelines.infra.data_types.enums import (
    EnsembleMemberType,
    HazardType,
    LayerName,
    SeverityKey,
)
from pipelines.infra.data_types.loaded_data_types import (
    AlertConfig,
    DataType,
    LoadedDataSource,
    RasterData,
)
from pipelines.infra.data_types.location_point import LocationPoint
from pipelines.infra.environment import load_environment_settings
from pipelines.infra.utils.alert_admin_aggregation import (
    aggregate_to_parent_admin_levels,
)
from pipelines.infra.utils.alert_centroid import compute_alert_centroid
from pipelines.infra.utils.api_client import ApiClient
from pipelines.infra.utils.data_provider_fetchers import _load_ibf_api_population_data
from pipelines.infra.utils.nrw_logger import log_info, LogTag
from rasterio.transform import Affine

logger = logging.getLogger(__name__)

DISCHARGE_SOURCES = {
    DataSource.GLOFAS_DISCHARGE_FTP,
    DataSource.GLOFAS_DISCHARGE_SEED_REPO_ALERT,
    DataSource.GLOFAS_DISCHARGE_SEED_REPO_NO_ALERT,
}


def run_station_sweep(
    config_path: Path,
    countries: Sequence[str] | None,
    cache_dir: Path,
    output_path: Path,
    refresh_population_cache: bool,
    return_period: float | None,
    station_codes: Sequence[str] | None,
    output_mode: OutputMode,
) -> int:
    load_dotenv()
    environment = load_environment_settings()
    if environment.is_production:
        raise RuntimeError(
            "The manual flood station sweep is not allowed in production"
        )

    source_target = SourceTarget.MOCK_ALERT
    config_reader = ConfigReader(source_target=source_target, infra_only=False)
    if not config_reader.load_all(config_path) or config_reader.config is None:
        raise RuntimeError(f"Could not load pipeline config: {config_path}")

    selected_countries = (
        {country.upper() for country in countries} if countries else None
    )
    country_configs = [
        country_config
        for country_config in config_reader.config.country_configs.values()
        if selected_countries is None
        or country_config.country_code_iso_3 in selected_countries
    ]
    if selected_countries is not None:
        found_countries = {
            str(country.country_code_iso_3) for country in country_configs
        }
        missing_countries = selected_countries - found_countries
        if missing_countries:
            raise ValueError(
                f"Countries not present in config: {', '.join(sorted(missing_countries))}"
            )

    api_client = ApiClient(
        run_origin=RunOrigin(os.environ.get("PIPELINE_RUN_ORIGIN", RunOrigin.LOCAL)),
        source_target=source_target.value,
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    all_results: list[dict[str, object]] = []
    with patch(
        "pipelines.infra.utils.data_provider_fetchers._load_ibf_api_population_data",
        side_effect=lambda config, container, client: _load_population_raster_cached(
            config,
            container,
            client,
            cache_dir,
            refresh_population_cache,
        ),
    ), patch.object(
        flood_forecast, "_get_glofas_discharge_paths", return_value=[]
    ), patch.object(
        flood_forecast, "archive_alert_glofas_files", side_effect=lambda paths: None
    ):
        for country_config in country_configs:
            country_results = _run_country_sweep(
                country_config=country_config,
                hazard_type=config_reader.config.hazard_type,
                api_client=api_client,
                return_period=return_period,
                station_codes=station_codes,
                output_mode=output_mode,
                forecast_output_dir=output_path.parent,
            )
            all_results.extend(country_results)

    output_path.write_text(
        json.dumps(
            {
                "createdAt": datetime.now(UTC).isoformat(),
                "dischargeScenario": (
                    "every ensemble member exceeds the station's highest configured return-period threshold"
                    if return_period is None
                    else f"every ensemble member is between the station's {return_period:g}yr threshold and the next higher threshold"
                ),
                "results": all_results,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    _print_summary(all_results, output_path)
    return int(any(result["status"] != "valid_alert" for result in all_results))


def _run_country_sweep(
    country_config: CountryRunConfig,
    hazard_type: HazardType,
    api_client: ApiClient,
    return_period: float | None,
    station_codes: Sequence[str] | None,
    output_mode: OutputMode,
    forecast_output_dir: Path,
) -> list[dict[str, object]]:
    country_code = country_config.country_code_iso_3
    data_sources: list[DataSourceConfig] = [
        source
        for source in country_config.data_sources
        if source.source not in DISCHARGE_SOURCES
    ]
    if not data_sources:
        return [
            _result(
                country_code,
                "",
                "load_error",
                ["No non-discharge data sources configured"],
            )
        ]

    provider_country = replace(country_config, data_sources=data_sources)
    data_provider = DataProvider(api_client, local_data="country")
    loaded, load_errors = data_provider.try_load_data(provider_country)
    if not loaded:
        return [_result(country_code, "", "load_error", load_errors)]

    alert_configs: list[AlertConfig] = data_provider.get_data(
        DataSource.ALERT_CONFIGS_IBF_API, list
    )
    admin_areas = data_provider.get_data(DataSource.ADMIN_AREA_IBF_API, AdminAreasSet)

    station_results: list[dict[str, object]] = []
    for alert_config in alert_configs:
        station_code = alert_config.spatial_extent_name
        if station_codes and station_code not in station_codes:
            continue
        submitter = _calculate_alerts(
            data_provider=data_provider,
            alert_configs=[alert_config],
            admin_areas=admin_areas,
            api_client=api_client,
            hazard_type=hazard_type,
            country_config=country_config,
            return_period=return_period,
        )
        errors = submitter.send_all(
            OutputMode.LOCAL,
            str(forecast_output_dir / str(country_code) / station_code),
        )

        if not submitter.get_alerts():
            station_results.append(
                _result(
                    country_code,
                    station_code,
                    "no_alert_created",
                    submitter.errors.values(),
                )
            )
            continue

        alert = submitter.get_alerts()[0]
        deepest_admin_area_exposure = [
            {
                "placeCode": item.place_code,
                "value": item.value,
            }
            for item in alert.exposure.admin_areas
            if item.admin_level == country_config.target_admin_level
            and item.layer == LayerName.EXPOSED_POPULATION
        ]
        median_return_periods = [
            item.severity_value
            for item in alert.severity
            if item.ensemble_member_type == EnsembleMemberType.MEDIAN
            and item.severity_key == SeverityKey.RETURN_PERIOD
        ]
        if errors:
            status = (
                "no_exposed_admin_areas"
                if any(
                    "admin-area: expected at least 1 record" in error
                    for error in errors
                )
                else "integrity_error"
            )
        else:
            status = "valid_alert"

        station_results.append(
            {
                "country": str(country_code),
                "stationCode": station_code,
                "status": status,
                "exposedAdminAreaCount": len(alert.exposure.admin_areas),
                "severityIntervalCount": len(
                    {
                        (item.time_interval.start, item.time_interval.end)
                        for item in alert.severity
                    }
                ),
                "peakMedianReturnPeriod": max(median_return_periods, default=None),
                "floodDepthRasterCount": len(alert.exposure.rasters),
                "deepestAdminAreaPopulation": deepest_admin_area_exposure,
                "centroid": (
                    {
                        "latitude": alert.centroid.latitude,
                        "longitude": alert.centroid.longitude,
                    }
                    if alert.centroid is not None
                    else None
                ),
                "errors": errors,
            }
        )

    if output_mode == OutputMode.API:
        station_results.extend(
            _submit_country_forecast(
                data_provider=data_provider,
                alert_configs=alert_configs,
                station_results=station_results,
                admin_areas=admin_areas,
                api_client=api_client,
                hazard_type=hazard_type,
                country_config=country_config,
                return_period=return_period,
                forecast_output_dir=forecast_output_dir,
            )
        )

    return station_results


def _submit_country_forecast(
    data_provider: DataProvider,
    alert_configs: list[AlertConfig],
    station_results: list[dict[str, object]],
    admin_areas: AdminAreasSet,
    api_client: ApiClient,
    hazard_type: HazardType,
    country_config: CountryRunConfig,
    return_period: float | None,
    forecast_output_dir: Path,
) -> list[dict[str, object]]:
    # One multi-alert forecast per country, as each forecast closes events not included in it.
    country_code = str(country_config.country_code_iso_3)
    valid_station_codes = {
        result["stationCode"]
        for result in station_results
        if result["status"] == "valid_alert"
    }
    valid_alert_configs = [
        alert_config
        for alert_config in alert_configs
        if alert_config.spatial_extent_name in valid_station_codes
    ]
    if not valid_alert_configs:
        return []

    submitter = _calculate_alerts(
        data_provider=data_provider,
        alert_configs=valid_alert_configs,
        admin_areas=admin_areas,
        api_client=api_client,
        hazard_type=hazard_type,
        country_config=country_config,
        return_period=return_period,
    )
    errors = submitter.send_all(
        OutputMode.API, str(forecast_output_dir / country_code / "all-stations")
    )
    if errors:
        return [_result(country_code, "", "api_error", errors)]
    return []


def _calculate_alerts(
    data_provider: DataProvider,
    alert_configs: list[AlertConfig],
    admin_areas: AdminAreasSet,
    api_client: ApiClient,
    hazard_type: HazardType,
    country_config: CountryRunConfig,
    return_period: float | None,
) -> DataSubmitter:
    country_code = str(country_config.country_code_iso_3)
    data_provider.loaded_data[DataSource.ALERT_CONFIGS_IBF_API].data = alert_configs
    submitter = DataSubmitter(api_client)
    submitter.set_forecast_metadata(
        issued_at=datetime.now(UTC),
        hazard_type=hazard_type,
        forecast_sources=[ForecastSource.GLOFAS],
        country_code_iso3=country_code,
    )
    with patch.object(
        flood_forecast,
        "extract_discharge_glofas_station",
        side_effect=partial(_simulated_station_discharge, return_period=return_period),
    ):
        flood_forecast.calculate_flood_forecasts(
            data_provider,
            submitter,
            country_code,
            country_config.target_admin_level,
        )

    for alert in submitter.get_alerts():
        alert.centroid = compute_alert_centroid(alert, admin_areas)
        aggregate_to_parent_admin_levels(alert, admin_areas)
    return submitter


def _simulated_station_discharge(
    station_code: str,
    station: LocationPoint,
    netcdf_paths: list[str],
    temporal_extent: dict[str, list[str]],
    return_period: float | None,
) -> dict[str, list[TimeIntervalDischarge]]:
    thresholds = cast(
        list[ReturnPeriodThresholdValue], station.attributes.get("thresholds", [])
    )
    discharge = _simulated_discharge_value(thresholds, return_period)
    if discharge is None:
        return {station_code: []}

    spectrum = temporal_extent.get("lead-time-spectrum", [])
    lead_days = sorted({int(entry.split("-")[0]) for entry in spectrum})
    forecast_day = datetime.now(UTC).date()
    intervals = [
        TimeIntervalDischarge(
            time_interval_start=(
                datetime.combine(forecast_day, datetime.min.time(), UTC)
                + timedelta(days=lead_day)
            ).strftime("%Y-%m-%dT%H:%M:%SZ"),
            time_interval_end=(
                datetime.combine(forecast_day, datetime.min.time(), UTC)
                + timedelta(days=lead_day + 1)
                - timedelta(seconds=1)
            ).strftime("%Y-%m-%dT%H:%M:%SZ"),
            ensemble_discharges=[discharge] * GLOFAS_MIN_ENSEMBLE_COUNT,
        )
        for lead_day in lead_days
    ]
    return {station_code: intervals}


def _simulated_discharge_value(
    thresholds: list[ReturnPeriodThresholdValue],
    return_period: float | None,
) -> float | None:
    finite_thresholds: dict[float, float] = {}
    for threshold in thresholds:
        threshold_value = threshold.get("threshold_value")
        if threshold_value is None:
            continue
        numeric_threshold = float(threshold_value)
        if np.isfinite(numeric_threshold):
            finite_thresholds[float(threshold["return_period"])] = numeric_threshold

    if not finite_thresholds:
        return None

    target_threshold = (
        max(finite_thresholds.values())
        if return_period is None
        else finite_thresholds.get(return_period)
    )
    if target_threshold is None:
        return None

    higher_thresholds = [
        value for value in finite_thresholds.values() if value > target_threshold
    ]
    if higher_thresholds:
        return (target_threshold + min(higher_thresholds)) / 2
    return target_threshold + max(abs(target_threshold) * 0.25, 1.0)


def _load_population_raster_cached(
    config: DataSourceConfig,
    container: LoadedDataSource,
    api_client: ApiClient,
    cache_dir: Path,
    refresh: bool,
) -> None:
    cache_path = cache_dir / f"population-{config.country_code_iso_3}.npz"
    if cache_path.exists() and not refresh:
        with np.load(cache_path, allow_pickle=False) as cached:
            container.data_type = DataType.RASTER_DATA
            container.data = RasterData(
                array=cached["array"].astype(np.float32),
                transform=Affine(*cached["transform"].tolist()),
                crs=str(cached["crs"].item()),
                nodata=float(cached["nodata"].item()),
            )
        log_info(logger, LogTag.INFRA, f"Loaded cached population raster {cache_path}")
        return

    _load_ibf_api_population_data(config, container, api_client)
    raster = container.data
    if not isinstance(raster, RasterData):
        raise TypeError(
            f"Population loader returned {type(raster).__name__}, expected RasterData"
        )

    temporary_path = cache_path.with_suffix(".tmp.npz")
    np.savez_compressed(
        temporary_path,
        array=raster.array,
        transform=np.asarray(tuple(raster.transform)[:6], dtype=np.float64),
        crs=np.asarray(raster.crs),
        nodata=np.asarray(raster.nodata, dtype=np.float64),
    )
    os.replace(temporary_path, cache_path)
    log_info(logger, LogTag.INFRA, f"Cached decoded population raster {cache_path}")


def _result(
    country: str,
    station_code: str,
    status: str,
    errors: Iterable[str],
) -> dict[str, object]:
    return {
        "country": str(country),
        "stationCode": station_code,
        "status": status,
        "errors": list(errors),
    }


def _print_summary(results: list[dict[str, object]], output_path: Path) -> None:
    statuses: dict[str, int] = {}
    for result in results:
        status = str(result["status"])
        statuses[status] = statuses.get(status, 0) + 1
    print("Manual flood station sweep:")
    for status, count in sorted(statuses.items()):
        print(f"  {status}: {count}")
    print(f"Detailed results: {output_path}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run every configured flood station with synthetic high GloFAS discharge."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("pipelines/infra/configs/floods.yaml"),
    )
    parser.add_argument(
        "--country",
        action="append",
        dest="countries",
        help="Limit to a country; repeat for multiple countries. Defaults to all configured countries.",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("data/manual-flood-station-sweep-cache"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("pipelines/output/manual-flood-station-sweep/results.json"),
    )
    parser.add_argument(
        "--refresh-population-cache",
        action="store_true",
        help="Redownload and decode population rasters instead of using cached NPZ files.",
    )
    parser.add_argument(
        "--return-period",
        type=float,
        help="Simulate discharge just above this return-period threshold (e.g. 10). Defaults to above the highest threshold.",
    )
    parser.add_argument(
        "--station",
        action="append",
        dest="station_codes",
        help="Limit to a station code; repeat for multiple stations. Defaults to all configured stations.",
    )
    parser.add_argument(
        "--output-mode",
        type=OutputMode,
        choices=list(OutputMode),
        default=OutputMode.LOCAL,
        help="'api' also posts one forecast per country with the alerts of all valid stations.",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    arguments = parse_arguments()
    exit_code = run_station_sweep(
        config_path=arguments.config,
        countries=arguments.countries,
        cache_dir=arguments.cache_dir,
        output_path=arguments.output,
        refresh_population_cache=arguments.refresh_population_cache,
        return_period=arguments.return_period,
        station_codes=arguments.station_codes,
        output_mode=arguments.output_mode,
    )
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
