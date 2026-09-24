# Compound Flood Pipeline Logic (WIP)

This folder contains the [DestinE](https://destination-earth.eu/use-cases/destine-pilot-service-global-tide-surge-forecast/) compound-flood-specific forecast logic used by the pipeline framework.

Unlike the `flood` pipeline (GloFAS discharge -> return periods -> static flood-depth maps), the DestinE forecast flood depth is a direct forecaster: a deterministic (single-run) flood-depth raster per lead time. Country: Philippines (PHL), coverage: 4 river-basin spatial extents (Pasig, Santa Maria, Bicol, Panay) over admin level 3 areas.

## Main script

- `forecast.py`
  - Entry point via `calculate_compound_flood_forecasts(...)`.
  - Loads alert configurations and admin areas through `DataProvider`, and resolves the DestinE flood-depth NetCDF directly from `data/bronze/` (prototype loader; see follow-ups).
  - Builds alerts, severity data, admin-area exposure, and raster exposure through `DataSubmitter`.
  - Creates one alert per alert config (spatial extent name(?)) per temporal extent, with all passing time intervals attached as severity records and the admin-area centroid as event centroid.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - Intended logic: read the flood-depth band per lead time from the (country-sliced) NetCDF file; band index = lead time + 1.
  - Clean outliers (cap values at the 95th percentile of valid cells) and mask permanent water bodies (`mask_permanent_water`).
  - Compute the median flood depth over each admin area's valid (non-water) cells per lead time.

- `determine_alerts.py`
  - Determines temporal extents (lead times) where the admin area's median flood depth reaches the minimum severity threshold.

- `compute_flood_depth.py`
  - Builds the boolean alert-extent raster (cells where flood depth exceeds the minimum threshold).

- `determine_exposure.py` (makes use of `pipelines/infra/utils`)
  - Clips the flood-depth raster to an admin area.
  - Computes population exposure: masks the population raster with the alert extent and aggregates per place code.

- `constants.py` (temp)
  - NetCDF band offset, units assumption (meters), outlier percentile.

- `data/severity_thresholds.json` (temp)
  - Per spatial extent minimum flood-depth threshold (meters): a flat dict keyed by place code with a single `threshold_value` each. The commented-out block in `forecast.py` shows the intended API-driven `severityClassLevels` equivalent once the pipeline `AlertConfig` carries them.

## DestinE forecast flood depth data

- **Local mock** (current): NetCDF files in `data/bronze/`, no filename datetime convention is required yet.
- **S3** (#TODO): real-time forecast files from the Deltares S3 server; requires a new `DataSource` in the infra layer (see follow-ups).

## `forecast.py` flow (read -> output)

1. Load core inputs:
   - Alert configurations and target admin areas through `DataProvider`.
   - DestinE NetCDF paths from `data/bronze/`; minimum thresholds from `data/severity_thresholds.json`.
   - Stop early and record an error if required input data is missing.

2. Build spatial extent:
   - Compute the bounding box from the target admin areas.
   - Slice each NetCDF file once to this bounding box (multiple files supported), clean outliers, mask permanent water bodies.

3. Process configured temporal extents:
   - Loop over alert configurations and their temporal extents (lead-time spectrum, 0-5 days).
   - Skip a config when its spatial extent is not found in the loaded admin areas.
   - Skip a temporal extent when no time intervals reach the minimum threshold.

4. Extract severity per temporal extent:
   - Read the lead-time band and take median flood depth over the admin area's valid cells.
   - Time interval severity = time intervals where the median reaches the minimum threshold; skip extents without time interval severities.

5. Build alert payload (per alert config, per time interval severity):
   - Compute the flood-depth raster from the time interval severities; clip it to the spatial extent and compute exposed place codes.
   - Population raster loaded lazily (first alert only) exposed population aggregated per place code.
   - `create_alert` with event name (currently the placeholder `"river_name"`; TODO river-name mapping from API) and the admin-area centroid.
   - Severity data: RUN and MEDIAN records per passing time interval (identical; deterministic forecast) under `SeverityKey.RETURN_PERIOD` carrying the median flood depth in meters (placeholder; see follow-ups).
   - Admin-area exposure (`exposedPopulation`) and raster exposure (`floodDepth`, base64 PNG + extent).

6. Write final output to local forecast folder:
   - `forecast.py` fills `DataSubmitter`.
   - `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
   - Default local base path is `pipelines/output`, resulting in paths like:
     - `pipelines/output/compoundFloods/{ISO3}/{timestamp}/forecast.json`
   - In this repository this appears under `data/pipelines/output/compoundFloods/...`.

