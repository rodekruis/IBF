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
| `--run-target` | Run target defined in the config (e.g. `DEBUG`, `TEST`)                          |

## Structure

The pipeline is split into two concerns:

- **`infra/`** — Hazard-agnostic infrastructure: config reading, data loading, data submission, and the main entry point. Maintained by engineers.
- **`<hazardType>/`** — Hazard-specific forecast logic. Each subfolder implements a single hazard type. Maintained by data scientists.

This separation means data scientists only need to implement one function per hazard type. That function receives a `DataProvider` (to read input data) and a `DataSubmitter` (to build alert output), and does not need to know about config files, file I/O, or API calls.

Here are the main files used by the hazard logic flow.

```
pipelines/
├── infra/                     # Hazard-agnostic infrastructure
│   ├── run_forecasts.py       # Main orchestration entry point
│   ├── config_reader.py       # YAML config loading and validation
│   ├── data_provider.py       # Data loading abstraction
│   ├── data_submitter.py      # Alert building and submission
│   └── configs/               # YAML config files per hazard
│       ├── floods.yaml
│       └── drought.yaml
├── flood/
│   └── forecast.py            # calculate_flood_forecasts(data_provider, data_submitter, country)
├── drought/
│   └── forecast.py            # calculate_drought_forecasts(data_provider, data_submitter, country)
├── test/                      # Unit, integration, and legacy tests
│   ├── unit/
│   ├── integration/
│   └── legacy/
└── legacy/                    # Old pipeline code (see Legacy section)
```

## YAML config files

Most of the fields in the config file are mapped to enums. You can see the allowed values by looking at the enums in `alert_types.py` and `data_source_types.py`.

To handle new configs and targets, see the sections below.

```
hazard_type                      # HazardType enum (e.g. "floods", "drought")
run_targets:
  <run_target>:                  # RunTargetType enum (DEBUG / TEST / PROD, etc.)
    countries:
      - iso_3_code               # ISO alpha-3 country code (e.g. "KEN", "ETH")
        target_admin_level       # Target admin level to make forecasts on (1–4)
        data_sources:
          - source               # DataSource enum showing where to fetch this data.
        output:
          mode                   # OutputMode enum (local / api)
          path                   # Optional, used for local output
```

### Adding a new hazard type

1. Create a new folder: `<hazard_type>/`
2. Add `__init__.py` and `forecast.py`
3. Implement a function that receives `DataProvider` and `DataSubmitter`
4. Register the hazard type in `infra/run_forecasts.py`
5. Add a config YAML in `infra/configs/<hazard_type>.yaml`

### Adding a new data source

1. Pick a string name you want to use in the config YAML file
2. Add that string name to a new enum value in `DataSource` in `data_config_types.py`
3. In `data_provider_fetchers.py`, add a new function to handle the downloading of the source.
4. Set the `LoadedDataSource.data_type` in that function. If you need to create a new `DataType` for this, do so. For the data you set, avoid using complex dictionaries, raw JSON, or other types that need lots of strings to be parsed, since these make it hard to find data errors, and make it hard to adjust the code if a source needs to change. If you have a data type like this, try to cast it to a dataclass and return that. These are easy to make with LLMs. You can have the LLM fetch the data source directly (via the URL, or from a local file) and then it can write a dataclass for you. See other data source types for examples.
5. Also in `data_provider_fetchers.py`, in the function `load_data_container`, add a `case` to direct your new enum to your function.
6. Add the data source string name to your config YAML, and run the pipeline locally to test it out.

## Tests

From the `<repo root>/data/` directory:

```bash
uv run pytest pipelines/test/unit/             # unit tests
uv run pytest pipelines/test/integration/      # integration tests
uv run pytest pipelines/test/legacy/           # legacy tests
```

Unit tests cover alert validation and data submitter logic. Integration tests run end-to-end forecasts for each hazard type.

## Legacy

Old pipeline code lives in `legacy/`. It contains previous-generation implementations for drought and river flood, with its own infrastructure in `legacy/core/`.

To run a legacy pipeline from the `<repo root>/data/` directory:

```bash
uv run pipelines/legacy/pipeline.py --hazard riverflood --country KEN --prepare --forecast --send --debug
```

There are also still integration tests on legacy code in `test/legacy`.
