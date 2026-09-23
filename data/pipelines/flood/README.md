# Flood Pipeline Logic (WIP)

This folder contains the flood-specific forecast logic used by the pipeline framework.

## Main script

- `flood/forecast.py`
  - Entry point for flood hazard logic via `calculate_flood_forecasts(...)`:
  - Loads alert configurations, station points, admin areas, population data, and flood-depth data through `DataProvider`, then combines them with GloFAS discharge data (from FTP or seed-repo mock files).
  - Builds alerts, severity time series, admin-area exposure, and raster exposure through `DataSubmitter`.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - Samples GloFAS discharge values from (sliced) NetCDF rasters at station coordinates.
  - Produces per-station, per-lead-time ensemble discharge series.

- `compute_flood_depth.py`
  - Resolves the flood depth raster to use for an alert through `FloodDepthProvider`.
  - Selects the highest available return period at or below the forecast return period, falls back to the lowest available return period, and creates a zero-valued in-memory raster when no threshold is exceeded.

- `determine_exposure.py`
  - Filters the place codes from each alert configuration to those present in the loaded admin areas.
  - Clips the selected flood depth raster to the affected admin areas and returns the exposed place codes.
  - Population exposure is computed in `forecast.py` and aggregated per place code.

- `pipelines/infra/utils/raster.py`
  - Utility functions for geospatial preprocessing:
    - derive country bounding box from admin geometries,
    - slice NetCDF to country bounds,
    - clip rasters to bounding boxes,
    - get raster extent for output metadata.

## GloFAS discharge data

GloFAS discharge NetCDF files are sourced either from:

- **FTP** (`glofas_discharge_ftp`): Real-time ensemble forecast files from the GloFAS FTP server.
- **Seed-repo alert** (`glofas_discharge_seed_repo_alert`): Country-clipped mock file with values above thresholds (triggers alerts).
- **Seed-repo no-alert** (`glofas_discharge_seed_repo_no_alert`): Country-clipped mock file with values below thresholds (no alerts).

## `forecast.py` flow (read -> output)

1. Load core inputs:
  - Load alert configurations, GloFAS station metadata, target admin areas, and a `FloodDepthProvider` through `DataProvider`.
  - Validate that alert-configuration place codes exist in the loaded admin areas.
  - Stop early and record an error if required input data is missing.

2. Build country spatial extent
   - Compute country bounding box from target admin areas.
   - Slice NetCDF files once to this bounding box.

3. Process configured alert extents
  - Loop through each alert configuration and its temporal extents, resolving the configured station for each spatial extent.
  - Extract discharge ensemble values per lead time and derive severities using thresholds stored in the station attributes.
  - Skip configurations with missing stations or no threshold exceedance.

4. Build alert payload
  - Select the flood depth raster based on the matched return periods.
  - Clip the flood depth to configured admin areas and collect valid exposed place codes.
  - Load the population raster lazily, then compute and aggregate exposed population per place code.

5. Compute exposure
  - Create one alert event per alerting station and temporal extent that exceeds the minimum return period.
  - Add return-period severity data for ensemble runs and the median discharge.
   - Add admin-area population exposure per place code.
  - Add raster exposure as an encoded PNG with its raster extent metadata; no flood raster file is written by the hazard logic.

6. Write final output to local forecast folder
   - `forecast.py` fills `DataSubmitter`.
   - `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
   - Default local base path is `pipelines/output`, resulting in paths like:
     - `pipelines/output/floods/{ISO3}/{timestamp}/forecast.json`
   - In this repository this appears under `data/pipelines/output/floods/...`.
