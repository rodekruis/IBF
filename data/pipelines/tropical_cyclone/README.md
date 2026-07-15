# Tropical Cyclone Pipeline Logic (WIP)

This folder contains the tropical-cyclone-specific forecast logic used by the pipeline framework.

## Main script

- `forecast.py`
  - Entry point for tropical-cyclone hazard logic via `calculate_tropical_cyclone_forecasts(...)`:
  - Loads target admin areas and alert configs through `DataProvider`, resolves the country's exposure-class/averaging-period config, then loads GEFS wind and track data (currently local test fixtures - see "GEFS data" below, real fetcher still `# TODO-infra`).
  - Builds alerts, severity time series, admin-area exposure, and raster exposure through `DataSubmitter`.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - `extract_wind_speed`: reads GEFS 10 m U/V wind GRIB2 (one file per member per lead time), converts to sustained wind speed, applies the country's averaging-period conversion factor.
  - Buckets output per the alert config's temporal extent (its `"lead-time-spectrum"`), aggregating GEFS's native 3-hour cadence up via a per-cell max whenever the configured interval is coarser.

- `extract_track.py`
  - `extract_track`: reads GEFS ATCF track files (one file per member, all lead times as rows), filters fixes to the monitoring bounds, dedups repeated wind-radii rows.
  - Used to derive the alert's storm-center centroid, not for the severity gate itself.

- `determine_alerts.py`
  - `determine_alert`: per time bucket per member, clips wind speed to the country's admin-area union and takes the land-clipped max (the `RUN` value); `MEDIAN` is the median of those.
  - Drops buckets whose `MEDIAN` doesn't clear `MIN_SEVERITY_MS`.

- `compute_wind_extent.py`
  - `compute_alert_extent`: picks the peak-intensity bucket (highest `MEDIAN`), then builds a precautionary per-cell-max envelope across that bucket's ensemble members, masked below `MIN_SEVERITY_MS`.

- `determine_exposure.py`
  - `determine_spatial_extent`: clips the wind-extent raster to the alert's admin areas (thin wrapper over `infra.utils.exposure.clip_raster_to_admin_areas`).

- `constants.py`
  - Per-country config (`COUNTRY_CONFIGS`): exposure class and sustained-wind averaging-period convention.
  - WMO/Harper averaging-period conversion factors, `MIN_SEVERITY_MS`, GEFS ensemble member IDs, `GEFS_NATIVE_LEAD_TIME_STEP_HOURS`, `MONITORING_BOX_BUFFER_KM`.

## GEFS data

- **Alert config** (`alert_configs_ibf_api`): spatial extent (national) and temporal extent (a `"lead-time-spectrum"`, e.g. 3-hour steps up to 168 hours) fetched from the IBF API per country.
- **GEFS wind** (GRIB2, `pgrb2sp25`) and **GEFS track** (ATCF `tctrack`) are not yet wired through `DataProvider`/`DataSource` - `# TODO-infra`. Until a real fetcher exists, `forecast.py` reads local files directly, picking the most recent `gefs.<date>/<hour>` cycle under `tropical_cyclone/bronze/gefs_wind/` and `.../bronze/gefs_track/`. That layout is a local-testing convention only (not committed, not fixed) - free to redesign once the real fetcher is built.

## `forecast.py` flow (read -> output)

1. Load admin areas and alert configs through `DataProvider`. Stop early and record an error if either is missing.
2. Resolve the country's config (exposure class, averaging-period convention) from `COUNTRY_CONFIGS`. Stop early if the country isn't configured.
3. Load GEFS wind and track member file paths (local test fixtures today). Stop early if either is missing.
4. Compute the country's monitoring bounding box: admin-area union padded by `MONITORING_BOX_BUFFER_KM`.
5. Loop over alert configs (spatial extents) and their temporal extents - matches flood/drought's generic structure, even though tropical cyclone has exactly one of each per country today.
6. `extract_wind_speed` + `determine_alert`. Skip to the next temporal extent if no bucket clears `MIN_SEVERITY_MS`.
7. `extract_track`, used to derive the storm centroid at the peak-intensity bucket.
8. `compute_alert_extent` + `determine_spatial_extent`.
9. Lazily load the population raster, only once a qualifying alert exists.
10. `compute_population_exposed` + `aggregate_population_exposed`.
11. Submit via `DataSubmitter`: `create_alert`, `add_severity_data` (per-member `RUN` + `MEDIAN`), `add_admin_area_exposure`, `add_raster_exposure`.

## Output

- `forecast.py` fills `DataSubmitter`; `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
- Default local base path is `pipelines/output`, resulting in paths like `pipelines/output/tropicalCyclone/{ISO3}/{timestamp}/forecast.json`.
- In this repository this appears under `data/pipelines/output/tropicalCyclone/...`.
