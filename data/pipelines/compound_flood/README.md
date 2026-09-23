# Compound Flood Pipeline Logic (WIP)

This folder contains the [DestinE](https://destination-earth.eu/use-cases/destine-pilot-service-global-tide-surge-forecast/) compound-flood-specific forecast logic used by the pipeline framework.

Unlike the `flood` pipeline (GloFAS discharge -> return periods -> static flood-depth maps), the DestinE forecast flood depth is a direct forecaster: a deterministic (single-run) flood-depth raster per lead time. Country: Philippines (PHL), coverage: 4 river-basin spatial extents (Pasig, Santa Maria, Bicol, Panay) over admin level 3 areas.

## Main script

- `forecast.py`
  - Entry point via `calculate_compound_flood_forecasts(...)`.
  - Loads alert configurations and admin areas through `DataProvider`, and resolves the DestinE flood-depth NetCDF directly from `data/bronze/` (prototype loader; see follow-ups).
  - Builds alerts, severity data, admin-area exposure, and raster exposure through `DataSubmitter`.
  - Creates one alert per exposed admin area per lead-time day, with the admin-area centroid as event centroid.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - Reads the flood-depth band per lead time from the (country-sliced) NetCDF file; band index = lead time + 1.
  - Cleans outliers (caps values at the 95th percentile of valid cells).
  - Masks permanent water bodies (stub: `mask_permanent_water` returns an all-False mask until a data source is wired).
  - Computes the median flood depth over each admin area's valid (non-water) cells per lead time.

- `determine_alerts.py`
  - Determines alerting temporal extents: lead times where the admin area's median flood depth reaches the minimum severity threshold.
  - Builds the boolean alert-extent raster (cells where flood depth exceeds the minimum threshold).

- `determine_exposure.py`
  - Clips the flood-depth raster to an admin area (via `pipelines/infra/utils/exposure.py`).
  - Computes population exposure: masks the population raster with the alert extent and aggregates per place code.

- `constants.py`
  - Bronze data directory, NetCDF band offset, units assumption (meters), outlier percentile, minimum severity label.

- `config/severity_thresholds.json`
  - Per spatial extent flood-depth severity thresholds (meters), mirroring the `severityClassLevels` of the PHL compoundFloods alert configs in the api-service seed (the pipeline `AlertConfig` does not carry them yet).

## DestinE forecast flood depth data

- **Local mock** (current): place one NetCDF file in `data/bronze/`. The file name must contain a 10-digit forecast datetime (`yyyyMMddHH`) and must not end with `_sliced.nc` (that suffix marks pipeline-generated slices).
- **S3** (#TODO): real-time forecast files from the Deltares S3 server; requires a new `DataSource` in the infra layer (see follow-ups).

## `forecast.py` flow (read -> output)

1. Load core inputs:
   - Alert configurations and target admin areas through `DataProvider`.
   - DestinE NetCDF path from `data/bronze/`; minimum thresholds from `config/severity_thresholds.json`.
   - Validate that alert-configuration place codes exist in the loaded admin areas.
   - Stop early and record an error if required input data is missing.

2. Build country spatial extent:
   - Compute the country bounding box from the target admin areas.
   - Slice the NetCDF once to this bounding box.

3. Process configured alert extents:
   - Loop over alert configurations (river basins) and their temporal extents (lead-time spectrum, 0-5 days).
   - Filter the configured place codes to those present in the loaded admin areas.
   - Skip configurations without matching thresholds in `config/severity_thresholds.json`.

4. Extract severity per admin area and lead time:
   - Read the lead-time band, clean outliers, mask permanent water bodies.
   - Median flood depth over the admin area's valid cells.
   - Alerting temporal extent = lead times where the median reaches the minimum threshold; skip admin areas without alerting days.

5. Build alert payload (per exposed admin area, per alerting lead-time day):
   - Boolean alert-extent raster; flood-depth raster clipped to the admin area.
   - Population raster loaded lazily (first alert only), exposed population aggregated per place code.
   - `create_alert` with event name `{ISO3}_compoundFlood_{placeCode}_{leadTime}day` and the admin-area centroid.
   - Severity data: RUN and MEDIAN records (identical; deterministic forecast) under `SeverityKey.RETURN_PERIOD` carrying the median flood depth in meters (placeholder; see follow-ups).
   - Admin-area exposure (`exposedPopulation`) and raster exposure (`floodDepth`, base64 PNG + extent).

6. Write final output to local forecast folder:
   - `forecast.py` fills `DataSubmitter`.
   - `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
   - Default local base path is `pipelines/output`, resulting in paths like:
     - `pipelines/output/compoundFloods/{ISO3}/{timestamp}/forecast.json`
   - In this repository this appears under `data/pipelines/output/compoundFloods/...`.

## Follow-ups (outside this folder)

1. Register `compoundFloods` in `pipelines/infra/run_forecasts.py` (`HAZARD_FUNCTIONS` + `FORECAST_SOURCES` -> `ForecastSource.COMPOUND_FLOODS_SOURCE`).
2. Fix `pipelines/infra/configs/compound_flood.yaml`: `hazard_type` should be `compoundFloods` (currently `floods`); check the config filename convention in `config_reader.py`.
3. Add `DataSource.DESTINE_FLOOD_DEPTH_S3` in the infra layer (enum + loader in `data_provider_fetchers.py`) and move the NetCDF loading out of `forecast.py`.
4. Add a `floodDepth` severity key to the shared enums (`SeverityKey`) + api-service, replacing the `RETURN_PERIOD` placeholder.
5. Wire a permanent-water-body data source for `mask_permanent_water` in `extract_forecast.py`.
6. Move severity thresholds to API-driven `severityClassLevels` once the pipeline `AlertConfig` carries them; note the local values (0.1/0.2/0.5 m) currently differ from the api-service seed (1.5/2/5 m).
