# Flood Pipeline Logic (WIP)

This folder contains the flood-specific forecast logic used by the pipeline framework.

## Main script

- `flood/forecast.py`
  - Entry point for flood hazard logic via `calculate_flood_forecasts(...)`:
  - Builds (and validate) alerts, exposure payloads through `DataSubmitter`.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - Samples GloFAS discharge values from (sliced) NetCDF rasters at station coordinates.
  - Produces per-station, per-lead-time ensemble discharge series.

- `compute_alert_extent.py`
  - Resolves the flood extent raster from flood extent raster catalog to use for an alert based on return period.
  - Falls back to closest lower return period, then to `*_empty.tif`.

- `determine_exposure.py`
  - Read mapping of station - admin areas.
  - Computes exposed population by intersecting flood extent with population raster.
  - Clips flood extent to affected admin areas for raster exposure output.

- `utils_raster.py`
  - Utility functions for geospatial preprocessing:
    - derive country bounding box from admin geometries,
    - slice NetCDF to country bounds,
    - get raster extent for output metadata.

## Bronze input data

`bronze/` holds preprocessed flood inputs used by `forecast.py`:

- `bronze/glofas/`
  - GloFAS discharge NetCDF files (ensemble forecast source).
  - Current code uses a path like `dis_00_YYYYMMDDHH.nc` and creates `_sliced.nc` files.

- `bronze/thresholds/`
  - Country-specific threshold JSON files (`*_{ISO3}.json`).
  - Used to convert discharge values into return-period-based alert severities.

- `bronze/station-district/`
  - Station-to-admin mapping JSON (`{ISO3}_station_district_mapping.json`).
  - Links station IDs to impacted place codes.

- `bronze/population/`
  - Country population raster (`{ISO3}.tif`).
  - Used to estimate exposed population inside flood extent.

- `bronze/flood_extents/`
  - Flood extent rasters by return period (`flood_map_{ISO3}_rp*.tif`) plus empty fallback.
  - Used to attach alert extent rasters to events.

## `forecast.py` flow (read -> output)

1. Load core inputs with `DataProvider`
   - GloFAS stations (`glofas_stations_seed_repo`)
   - Target admin areas (`admin_area_seed_repo`)

2. Load temporary local flood inputs from `bronze/`
   - GloFAS NetCDF paths
   - Threshold JSON
   - Station-district mapping JSON
   - Population raster path
   - Flood extent raster paths

3. Build country processing extent
   - Compute country bounding box from target admin areas.
   - Slice NetCDF files once to this bounding box.

4. Process stations
   - Extract discharge ensemble values per lead time.
   - Derive lead-time severities from thresholds.
   - Skip stations with no threshold exceedance.

5. Build alert payload
   - Create one alert event per alerting station.
   - Add severity time-series data (run members + median).

6. Compute exposure
   - Select flood extent raster by highest matched return period.
   - Compute exposed population per place code.
   - Clip flood extent to impacted admin geometries.
   - Add admin area exposure and raster exposure to the event.

7. Write final output to local forecast folder
   - `forecast.py` fills `DataSubmitter`.
   - `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
   - Default local base path is `pipelines/output`, resulting in paths like:
     - `pipelines/output/floods/{ISO3}/{timestamp}/forecast.json`
   - In this repository this appears under `data/pipelines/output/floods/...`.
