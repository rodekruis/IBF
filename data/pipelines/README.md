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
| `--scenario`   | _(optional)_ Infra-level override: `no-alert` or `alert`. Bypasses forecast.py   |
| `--issued-at`  | _(optional)_ Override the issued-at timestamp (ISO 8601). Requires `--scenario`  |

## Structure

The pipeline is split into two concerns:

- **`infra/`** — Hazard-agnostic infrastructure: config reading, data loading, data submission, and the main entry point. Maintained by engineers.
- **`<hazardType>/`** — Hazard-specific forecast logic. Each subfolder implements a single hazard type. Maintained by data scientists.

This separation means data scientists only need to implement one function per hazard type. That function receives a `DataProvider` (to read input data) and a `DataSubmitter` (to build alert output), and does not need to know about config files, file I/O, or API calls.

### run_target vs scenario

These two concepts are orthogonal:

- **`--run-target`** selects an environment configuration from the YAML config: which countries to run, which data sources to load, and where to write output. It flows through the entire pipeline including `forecast.py`.
- **`--scenario`** is an infra-level override that _replaces_ the hazard logic in `forecast.py` with a predetermined outcome (`no-alert` = empty alerts, `alert` = one synthetic alert). The real `forecast.py` never runs.

This means any run target can be combined with any scenario (`--run-target DEBUG --scenario alert`), and adding new scenarios does not require new run targets or vice versa.

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
├── test/
│   ├── unit/                  # Unit tests on individual functions
│   ├── integration_infra/     # Infra integration tests (scenarios, bypasses forecast.py)
│   ├── integration_infra_api/ # Infra + API integration tests (scenarios submitted to live API)
│   └── integration_pipeline/  # FUTURE: full pipeline tests with mock input data through forecast.py
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
uv run pytest pipelines/test/unit/                  # unit tests
uv run pytest pipelines/test/integration_infra/     # infra integration tests (scenarios, bypasses forecast.py)
uv run pytest pipelines/test/integration_infra_api/ # infra + API integration tests (scenarios submitted to live API)
```

Unit tests cover alert validation and data submitter logic. Infra integration tests use the `--scenario` flag to bypass `forecast.py`, exercising only the pipeline infrastructure (config parsing, data loading, data submission, output writing). Future `integration_pipeline/` tests will run the full pipeline with controlled mock input data flowing through `forecast.py`.
