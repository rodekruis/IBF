# Hazard-Specific Forecast Logic

This folder contains hazard-specific forecast implementations that use the
pipeline infrastructure from `pipelines/infra/`.

## Why this folder?

The pipeline is split into two concerns:

- **`pipelines/infra/`** — Hazard-agnostic infrastructure: config reading, data
  loading, data submission, and the main entry point. Maintained by engineers.
- **`pipelines/<hazardType>/`** — Hazard-specific forecast logic. Each subfolder implements
  a single hazard type. Maintained by data scientists.

This separation means data scientists only need to implement one function per
hazard type. That function receives a `DataProvider` (to read input data) and a
`DataSubmitter` (to build alert output), and does not need to know about config
files, file I/O, or API calls.

## Structure

```
infra/
flood/
  forecast.py      → calculate_flood_forecasts(data_provider, data_submitter, country)
drought/
  forecast.py      → calculate_drought_forecasts(data_provider, data_submitter, country)
```

## Adding a new hazard type

1. Create a new folder: `<hazard_name>/`
2. Add `__init__.py` and `forecast.py`
3. Implement a function that receives `DataProvider` and `DataSubmitter`
4. Register the hazard in `infra/run_forecasts.py` (Phase 5)
5. Add a config YAML in `infra/configs/<hazard_name>.yaml`

## Relation to existing pipelines

Old pipeline code is in `legacy`
