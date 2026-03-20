# v2 — Hazard-Specific Forecast Logic

This folder contains hazard-specific forecast implementations that use the
pipeline infrastructure from `pipelines/infra/`.

## Why this folder?

The pipeline is split into two concerns:

- **`pipelines/infra/`** — Hazard-agnostic infrastructure: config reading, data
  loading, data submission, and the main entry point. Maintained by engineers.
- **`pipelines/v2/`** — Hazard-specific forecast logic. Each subfolder implements
  a single hazard type. Maintained by data scientists.

This separation means data scientists only need to implement one function per
hazard type. That function receives a `DataProvider` (to read input data) and a
`DataSubmitter` (to build alert output), and does not need to know about config
files, file I/O, or API calls.

## Structure

```
v2/
  flood/
    forecast.py      → calculate_flood_forecasts(data_provider, data_submitter, country)
  drought/
    forecast.py      → calculate_drought_forecasts(data_provider, data_submitter, country)
```

## Adding a new hazard type

1. Create a new folder: `v2/<hazard_name>/`
2. Add `__init__.py` and `forecast.py`
3. Implement a function that receives `DataProvider` and `DataSubmitter`
4. Register the hazard in `infra/run_forecasts.py` (Phase 5)
5. Add a config YAML in `infra/configs/<hazard_name>.yaml`

## Relation to existing pipelines

The `pipelines/drought/` and `pipelines/riverflood/` folders contain the
original pipeline implementations. The `v2/` folder is their eventual
replacement, built on the new infrastructure. Both coexist during the transition.

Once the original `drought/` and `riverflood/` folders are removed, the contents
of `v2/` will move up to `pipelines/flood/` and `pipelines/drought/` directly,
and the `v2/` folder will be deleted. The `v2` name is purely a temporary
measure to avoid naming collisions during the transition.
