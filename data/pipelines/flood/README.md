# Flood Pipeline Logic (WIP)

This folder contains the flood-specific forecast logic used by the pipeline framework.

## Main script

- `flood/forecast.py`
  - Entry point for flood hazard logic via `calculate_flood_forecasts(...)`:
  - Loads station points and admin areas through `DataProvider`, then combines them with GloFAS discharge data (from FTP or seed-repo mock files).
  - Builds alerts, severity time series, admin-area exposure, and raster exposure through `DataSubmitter`.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - Samples GloFAS discharge values from (sliced) NetCDF rasters at station coordinates.
  - Produces per-station, per-lead-time ensemble discharge series.

- `compute_alert_extent.py`
  - Resolves the flood extent raster to use for an alert from the available flood extent files.
  - Selects the highest matched return period, falls back to the closest lower return period, then to `*_empty.tif`.

- `determine_exposure.py`
  - Reads the station-to-admin-area mapping and filters to place codes present in the loaded admin areas.
  - Clips the selected flood extent raster to affected admin areas for raster exposure output.
  - Computes an exposed-population raster and aggregates exposed population per place code.

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
   - Load GloFAS station metadata and target admin areas through `DataProvider`.
   - Load threshold JSON, population raster, and flood extent rasters through `DataProvider`.
   - Stop early and record an error if stations or admin areas are missing.

2. Build country spatial extent
   - Compute country bounding box from target admin areas.
   - Slice NetCDF files once to this bounding box.

3. Process discharge per station
   - Iterate through stations and currently limit processing to the first two station entries.
   - Extract discharge ensemble values per lead time.
   - Derive lead-time severities from thresholds.
   - Skip stations with no threshold exceedance.

4. Build alert payload
   - Select the alert extent raster based on the matched return periods.
   - Clip the flood extent to mapped admin areas and collect exposed place codes.
   - Compute the exposed-population raster and aggregate exposed population per place code.

5. Compute exposure
   - Create one alert event per alerting station.
   - Add severity time-series data for ensemble runs and the median discharge.
   - Add admin-area population exposure per place code.
   - Add raster exposure metadata for the generated `alert_extent_{station_code}.tif`.

6. Write final output to local forecast folder
   - `forecast.py` fills `DataSubmitter`.
   - `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
   - Default local base path is `pipelines/output`, resulting in paths like:
     - `pipelines/output/floods/{ISO3}/{timestamp}/forecast.json`
   - In this repository this appears under `data/pipelines/output/floods/...`.
