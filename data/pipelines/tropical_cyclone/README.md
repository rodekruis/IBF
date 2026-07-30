# Tropical Cyclone Pipeline Logic (WIP)

This folder contains the tropical-cyclone-specific forecast logic used by the pipeline framework.

## Main script

- `forecast.py`
  - Entry point via `calculate_tropical_cyclone_forecasts(...)`.
  - Loads target admin areas and alert configs through `DataProvider`, resolves the country's
    exposure-class/averaging-period/forecast-source config, then loads that source's wind and
    track data (currently local test fixtures - see "Forecast-source data").
  - Builds alerts, severity time series, admin-area exposure, and raster exposure through
    `DataSubmitter` - one alert per tracked storm.

## Accompanying scripts in this folder

- `extract_forecast.py`
  - `extract_wind_speed`: reads 10 m U/V wind GRIB2 (GEFS or ECMWF), converts to sustained wind
    speed, applies the country's averaging-period conversion factor.
  - Buckets output per the alert config's temporal extent, aggregating up via a per-cell max when
    the configured interval is coarser than the source's native cadence.

- `extract_track.py`
  - `extract_track`: reads GEFS ATCF track fixes and groups them into one `StormTrack` per storm
    (`BASIN`+`CY`), filtered to the monitoring bounds. **GEFS only** - raises `NotImplementedError`
    for ECMWF.
  - ATCF invests (cyclone numbers 90-99) are dropped.
  - `StormTrack.storm_identifier`: stable per-storm event name, e.g. `WP24_2025`.
  - `derive_alert_centroid`: the storm-center point to report, or `None` if the peak-wind bucket
    falls outside that storm's tracked window.
  - `select_place_codes_near_storm`: the admin areas near one storm's own track, used to scope that
    storm's alert.
  - `find_storm_pairs_sharing_place_codes`: flags storm pairs scoped to overlapping admin areas.

- `determine_alerts.py`
  - `determine_severities`: per time bucket per member, land-clips wind speed and takes the max
    (the `RUN` value); `MEDIAN` is the median of those. Drops buckets under `MIN_SEVERITY_MS`.

- `compute_wind_extent.py`
  - `compute_alert_extent`: precautionary per-cell-max envelope across every member and every
    qualifying time bucket, masked below `MIN_SEVERITY_MS`.

- `determine_exposure.py`
  - `clip_wind_extent_to_admin_areas`: clips the wind-extent raster to the alert's admin areas.

- `constants.py`
  - Per-country config (`COUNTRY_CONFIGS`): exposure class, averaging-period convention, forecast
    source.
  - WMO/Harper conversion factors, `MIN_SEVERITY_MS`, `MONITORING_BOX_BUFFER_KM`, per-source
    ensemble/cadence constants.

## Forecast-source data

- **Alert config**: spatial + temporal extent (`"lead-time-spectrum"`), fetched from the IBF API.
- **Wind** (GRIB2) and **track** aren't wired through `DataProvider` yet (`# TODO-infra`).
  `forecast.py` reads the most recent local cycle directly: GEFS from
  `bronze/gefs_wind/`/`bronze/gefs_track/`, ECMWF from `bronze/ecmwf_wind/`/`bronze/ecmwf_track/`.
  These layouts are a local-testing convention only, not a fixed contract.
- Every country is on **GEFS** today. Whichever source a country uses needs its `bronze/` fixtures
  on disk, or the run stops at the wind/track loading guard.
- ECMWF fixtures: `uv run python data_management/seed_data_management/fetch_ecmwf_tropical_cyclone_test_data.py`
  (from `data/`). GEFS fixtures are fetched by hand.

## Running this locally

`tropicalCyclone.yaml` has no `source_target`-tagged data source yet, so a real (non-`--infra-only`)
run needs a local-only gate relax in `config_reader.py` - **never commit it**:

```python
# data/pipelines/infra/config_reader.py, in _parse_countries
log_warning(...)   # was log_error
# success = False   <- drop
# continue          <- drop
```

Then:

```bash
uv run pipeline --config pipelines/infra/configs/tropicalCyclone.yaml --country PHL --mock 1 --output-mode local
```

A running backend with PHL seeded is still required (admin areas/population/alert configs hit the
real API); wind/track come from whichever `bronze/` cycle is most recent on disk, regardless of
`--mock`.

## `forecast.py` flow (read -> output)

1. Load admin areas, alert configs, population raster through `DataProvider`.
2. Resolve the country's config from `COUNTRY_CONFIGS`.
3. Load the configured source's wind and track file paths.
4. Compute the country's monitoring bounding box.
5. `extract_track` once, giving one `StormTrack` per tracked storm; stop early if none are nearby.
6. Loop over alert configs (spatial extents) x temporal extents. Per spatial extent, scope every
   storm to its own admin areas and flag any pair that overlaps.
7. `extract_wind_speed` once per temporal extent (shared across all storms).
8. Per storm: `determine_severities` -> `derive_alert_centroid` -> `compute_alert_extent` +
   `clip_wind_extent_to_admin_areas` -> `compute_population_exposed` + `aggregate_population_exposed`
   -> submit via `DataSubmitter` under that storm's `storm_identifier`.

## Output

- `forecast.py` fills `DataSubmitter`; `pipelines/infra/run_forecasts.py` finalizes and writes
  `forecast.json`.
- Default local base path is `pipelines/output`, e.g.
  `pipelines/output/tropicalCyclone/{ISO3}/{timestamp}/forecast.json`
  (`data/pipelines/output/tropicalCyclone/...` in this repository).
