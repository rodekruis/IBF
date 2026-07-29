# Tropical Cyclone Pipeline Logic (WIP)

This folder contains the tropical-cyclone-specific forecast logic used by the pipeline framework.

## Main script

- `forecast.py`
  - Entry point for tropical-cyclone hazard logic via `calculate_tropical_cyclone_forecasts(...)`:
  - Loads target admin areas and alert configs through `DataProvider`, resolves the country's exposure-class/averaging-period/forecast-source config, then loads that source's (GEFS or ECMWF) wind and track data (currently local test fixtures - see "Forecast-source data" below, real fetcher still `# TODO-infra`).
  - Builds alerts, severity time series, admin-area exposure, and raster exposure through `DataSubmitter`.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - `extract_wind_speed`: dispatches on the country's forecast source and reads 10 m U/V wind GRIB2 - GEFS (one file per member per lead time) or ECMWF (one file per ensemble step, member via the GRIB `number` key) - converts to sustained wind speed, applies the country's averaging-period conversion factor.
  - Buckets output per the alert config's temporal extent (its `"lead-time-spectrum"`), aggregating the source's native cadence up via a per-cell max whenever the configured interval is coarser.

- `extract_track.py`
  - `extract_track`: dispatches on the country's forecast source and reads track fixes - GEFS ATCF (one file per member, all lead times as rows, deduping repeated wind-radii rows) or ECMWF BUFR (one file per run, members as subsets) - filtering fixes to the monitoring bounds.
  - `derive_storm_centroid`: storm-center point at the peak-intensity wind bucket - an exact match uses that bucket's ensemble-mean fix directly, otherwise linearly interpolates between the two real track fixes bracketing that time (track's 6h native cadence rarely lines up exactly with wind's 3h cadence), clamped to the nearest bucket if the peak time falls outside track's own window. Falls back to the admin-area centroid if there are no track fixes at all. Source-agnostic: it only reads each fix's lat/lon.

- `determine_alerts.py`
  - `determine_severities`: per time bucket per member, clips wind speed to the country's admin-area union and takes the land-clipped max (the `RUN` value); `MEDIAN` is the median of those.
  - Drops buckets whose `MEDIAN` doesn't clear `MIN_SEVERITY_MS`.

- `compute_wind_extent.py`
  - `compute_alert_extent`: precautionary per-cell-max envelope across every ensemble member in every qualifying time bucket (a union across the whole forecast window, not just the peak-intensity moment), masked below `MIN_SEVERITY_MS`.

- `determine_exposure.py`
  - `clip_wind_extent_to_admin_areas`: clips the wind-extent raster to the alert's admin areas (thin wrapper over `infra.utils.exposure.clip_raster_to_admin_areas`).

- `constants.py`
  - Per-country config (`COUNTRY_CONFIGS`): exposure class, sustained-wind averaging-period convention, and forecast source (GEFS or ECMWF).
  - WMO/Harper averaging-period conversion factors, `MIN_SEVERITY_MS`, per-source ensemble/format constants (GEFS member IDs + native lead-time constants for wind `GEFS_NATIVE_LEAD_TIME_STEP_HOURS` 3h and track `GEFS_TRACK_NATIVE_LEAD_TIME_STEP_HOURS` 6h; ECMWF streams, `ECMWF_NATIVE_LEAD_TIME_STEP_HOURS`, `ECMWF_TRACK_FIX_INTERVAL_HOURS`, unit conversions), `MONITORING_BOX_BUFFER_KM`.
  
## Forecast-source data

- **Alert config** (`alert_configs_ibf_api`): spatial extent (national) and temporal extent (a `"lead-time-spectrum"`, e.g. 3-hour steps up to 168 hours) fetched from the IBF API per country.
- **Wind** (GRIB2) and **track** are not yet wired through `DataProvider`/`DataSource` - `# TODO-infra`. Until a real fetcher exists, `forecast.py` reads local files directly per the country's forecast source: GEFS from the most recent `gefs.<date>/<hour>` cycle under `tropical_cyclone/bronze/gefs_wind/` and `.../bronze/gefs_track/` (wind `pgrb2sp25` GRIB2, track ATCF `tctrack`); ECMWF from the most recent `<YYYYMMDD>/<HH>z` cycle under `.../bronze/ecmwf_wind/` and `.../bronze/ecmwf_track/` (wind `oper`/`enfo` GRIB2, track `tf` BUFR). Those layouts are a local-testing convention only (not committed, not fixed) - free to redesign once the real fetcher is built.

## Running this locally

TODO-infra-remove: remove this entire section once GEFS wind/track are wired through real
`DataSource.GEFS_WIND`/`DataSource.GEFS_TRACK` fetchers and `tropicalCyclone.yaml` no longer needs
the temporary source-target gate workaround.

`tropicalCyclone.yaml` has no `source_target`-tagged data source yet, so `config_reader.py`'s
source-target gate rejects the config for any run that isn't `--infra-only` (which skips
`forecast.py` entirely). To run the real hazard logic locally, relax that gate on your machine only

- **do not commit**:

```python
# data/pipelines/infra/config_reader.py, in _parse_countries
log_warning(...)   # was log_error
# success = False   <- drop
# continue          <- drop
```

Then `uv run pipeline --config pipelines/infra/configs/tropicalCyclone.yaml --country PHL --mock 1
--output-mode local` (no `--infra-only`) will run for real. Note this doesn't mock anything else:
GEFS wind/track still come from whichever `bronze/` cycle is most recent on disk regardless of
`--mock`, and admin areas/population/alert configs still hit the real API - a running backend with
PHL seeded is still required. Real fix: a real `DataSource.GEFS_WIND`/`GEFS_TRACK` fetcher (see the
`# TODO-infra` in `tropicalCyclone.yaml`), which removes the need for this gate/workaround.

## `forecast.py` flow (read -> output)

1. Load admin areas, alert configs, and the population raster through `DataProvider`. Stop early and record an error if admin areas or alert configs are missing.
2. Resolve the country's config (exposure class, averaging-period convention) from `COUNTRY_CONFIGS`. Stop early if the country isn't configured.
3. Load GEFS wind and track member file paths (local test fixtures today). Stop early if either is missing.
4. Compute the country's monitoring bounding box: admin-area union padded by `MONITORING_BOX_BUFFER_KM`.
5. `extract_track` once for the run; if no fixes are in the monitoring box, stop early (no TC present for this country/run).
6. Loop over alert configs (spatial extents) and their temporal extents - matches flood/drought's generic structure, even though tropical cyclone has exactly one of each per country today.
7. `extract_wind_speed` + `determine_severities`. Skip to the next temporal extent if no bucket clears `MIN_SEVERITY_MS`.
8. `compute_alert_extent` + `clip_wind_extent_to_admin_areas`.
9. `compute_population_exposed` + `aggregate_population_exposed`.
10. Submit via `DataSubmitter`: `create_alert`, `add_severity_data` (per-member `RUN` + `MEDIAN`), `add_admin_area_exposure`, `add_raster_exposure`.

## Output

- `forecast.py` fills `DataSubmitter`; `pipelines/infra/run_forecasts.py` finalizes and writes `forecast.json`.
- Default local base path is `pipelines/output`, resulting in paths like `pipelines/output/tropicalCyclone/{ISO3}/{timestamp}/forecast.json`.
- In this repository this appears under `data/pipelines/output/tropicalCyclone/...`.
