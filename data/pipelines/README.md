# Forecast Pipelines

Hazard-specific forecast implementations that use the pipeline infrastructure from `infra/`.

## Setup & Getting Started

### Setup

See the [data README](../README.md) for general Python/UV setup and dependency management.

### Running a pipeline

From the `<repo root>/data/` directory:

```bash
uv run pipeline --config pipelines/infra/configs/floods.yaml --run-target DEBUG
```

| Flag           | Description                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `--config`     | Path to the hazard YAML config file (e.g. `pipelines/infra/configs/floods.yaml`) |
| `--run-target` | Run target defined in the config (e.g. `DEBUG`, `LIVE`)                          |

## Structure

The pipeline is split into two concerns:

- **`infra/`** — Hazard-agnostic infrastructure: config reading, data loading, data submission, and the main entry point. Maintained by engineers.
- **`<hazardType>/`** — Hazard-specific forecast logic. Each subfolder implements a single hazard type. Maintained by data scientists.

This separation means data scientists only need to implement one function per hazard type. That function receives a `DataProvider` (to read input data) and a `DataSubmitter` (to build alert output), and does not need to know about config files, file I/O, or API calls.

```
pipelines/
├── infra/                     # Hazard-agnostic infrastructure
│   ├── run_forecasts.py       # Main orchestration entry point
│   ├── config_reader.py       # YAML config loading and validation
│   ├── data_provider.py       # Data loading abstraction
│   ├── data_submitter.py      # Alert building and submission
│   ├── alert_types.py         # Dataclasses (Alert, Centroid, etc.)
│   ├── integrity_checks.py    # Alert validation before submission
│   └── configs/               # YAML config files per hazard
│       ├── floods.yaml
│       └── drought.yaml
├── flood/
│   └── forecast.py            # calculate_flood_forecasts(data_provider, data_submitter, country)
├── drought/
│   └── forecast.py            # calculate_drought_forecasts(data_provider, data_submitter, country)
└── legacy/                    # Old pipeline code (see Legacy section)
```

## Adding a new hazard type

1. Create a new folder: `<hazard_type>/`
2. Add `__init__.py` and `forecast.py`
3. Implement a function that receives `DataProvider` and `DataSubmitter`
4. Register the hazard type in `infra/run_forecasts.py`
5. Add a config YAML in `infra/configs/<hazard_type>.yaml`

## Tests

From the `<repo root>/data/` directory:

```bash
uv run pytest test/unit/             # unit tests
uv run pytest test/integration/      # integration tests
uv run pytest test/legacy/           # legacy tests
```

Unit tests cover alert validation and data submitter logic. Integration tests run end-to-end forecasts for each hazard type. See `test/` for details.

## Legacy

Old pipeline code lives in `legacy/`. It contains previous-generation implementations for drought and river flood, with its own infrastructure in `legacy/core/`.

To run a legacy pipeline from the `<repo root>/data/` directory:

```bash
uv run pipelines/legacy/pipeline.py --hazard riverflood --country KEN --prepare --forecast --send --debug
```

There are also still integration tests on legacy code in `test/legacy`.
