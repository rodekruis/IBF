# Forecast Pipelines

Hazard-specific forecast implementations that use the pipeline infrastructure from `infra/`.

## Setup & Getting Started

### Setup

See the [data README](../README.md) for general Python/UV setup and dependency management.

### Running a pipeline locally

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

## Deploying pipelines to Azure Databricks

Note: logging in to Azure Databricks locally via the CLI can be troublesome with login caching and login precedence since you need to be logged in as the 'service principal' for some steps (using the .env vars), and as your account for others (running the job, etc.).
Use these commands to manage your login:

- Clearing the env vars. You'll see this is part of some of the commands for setting up the env and service principal.

  ```bash
  unset DATABRICKS_HOST DATABRICKS_CLIENT_ID DATABRICKS_CLIENT_SECRET DATABRICKS_TOKEN DATABRICKS_CONFIG_PROFILE
  ```

- If the above doesn't work, delete the CLI config, and then clear the env vars:

  ```bash
  rm ~/.databrickscfg
  unset DATABRICKS_HOST DATABRICKS_CLIENT_ID DATABRICKS_CLIENT_SECRET DATABRICKS_TOKEN DATABRICKS_CONFIG_PROFILE
  ```

- Log in. You’ll get a prompt like `Databricks profile name [adb-7405XXXXXXX]:`. Just hit enter, your browser will open, and you can authenticate via SSO:

  ```bash
  databricks auth login --host https://adb-XXXX.XX.azuredatabricks.net
  ```

- To check what you're logged in as, run this:

  ```bash
  databricks auth describe
  ```

### Setting up Azure Databricks (one time per environment)

#### Create the resource

1. Go to https://portal.azure.com/#home.
1. Create the resource **Azure Databricks** for the `510 Anticipatory Action` subscription.
1. Select **Serverless** compute.
1. Create with the tags: `owner: <your email>`, `environment: <dev, test, etc>`.

#### Create a ’Service Principal’ account

These steps are to create a service principal that is managed inside Databricks. You can also create an Entra ID (subscription scope) to use as the service principal, but this requires admin permissions for the Azure subscription.

1. Go to the Databricks **workspace**. From the overview page, you can get there by clicking on the resource url, or just by going to https://accounts.azuredatabricks.net.
1. Click on **Settings** (top right user menu) → **Identity and access → Service principals → Add service principal → Add new**.
1. Give it any name, such as `nrw-test-bot`. Click **Add**. Default settings give it permissions to run jobs, but if more access is needed, you can create a group with higher permissions, and assign it to that.
1. In the service principal management panel (this should be open if you just made it, but if not, **Identity and access → Service principals → manage** for the principal you want) → **Secrets tab → Generate secret**. Copy the Client ID and Secret (i.e. to your .env file for DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET) since the secret is shown only once. (Question: should each user have their own secret, or do we share one for local testing?)

#### Create the `nrw` secret scope and populate it

The pipelines read runtime configuration (the IBF API URL and pipeline API key) from a Databricks secret scope. Do this setup once per Databricks workspace (i.e. per environment).

1. Log in to the CLI (see above).
1. Create the `nrw` secret scope and add the secrets the pipelines need. The commands below read `IBF_API_URL` and `IBF_PIPELINE_API_KEY` from your `data/.env` file and pipe them into `put-secret` via stdin so the values don't end up in your shell history. Run from the `data/` directory:

   ```bash
   set -a && source <(tr -d '\r' < .env) && set +a

   (
     unset DATABRICKS_HOST DATABRICKS_CLIENT_ID DATABRICKS_CLIENT_SECRET DATABRICKS_TOKEN DATABRICKS_CONFIG_PROFILE
     databricks secrets create-scope nrw
     printf %s "$IBF_API_URL"          | databricks secrets put-secret nrw IBF_API_URL
     printf %s "$IBF_PIPELINE_API_KEY" | databricks secrets put-secret nrw IBF_PIPELINE_API_KEY
   )
   ```

1. Grant the service principal read access to the scope so its jobs can resolve the secrets. For a Databricks-managed service principal, its application ID is the same as its client ID, so the command below reads `DATABRICKS_CLIENT_ID` from your `data/.env` file. Run from the `data/` directory:

   ```bash
   set -a && source <(tr -d '\r' < .env) && set +a

   (
     SP_APPLICATION_ID="$DATABRICKS_CLIENT_ID"
     unset DATABRICKS_HOST DATABRICKS_CLIENT_ID DATABRICKS_CLIENT_SECRET DATABRICKS_TOKEN DATABRICKS_CONFIG_PROFILE
     databricks secrets put-acl nrw "$SP_APPLICATION_ID" READ
   )
   ```

### Deploying from GitHub

Deploys are handled by `.github/workflows/deploy_databricks_pipelines.yml`, which runs `databricks bundle deploy` from the `data/` directory using the bundle defined in `databricks.yml`. As of May 2026 the workflow only deploys to the `test` target.

- Any push to `main` that touches `data/**` (or the workflow file itself) auto-deploys to the configured environment.
- You can also manually trigger a deploy from the Actions tab with `workflow_dispatch`.

To enable the workflow, add the following as **GitHub Actions secrets** (repo **→ Settings → Secrets and variables → Actions → New repository secret**):

- `DATABRICKS_HOST`
- `DATABRICKS_CLIENT_ID`
- `DATABRICKS_CLIENT_SECRET`

Note: these are the only secrets that go here. Other secrets needed by the job at runtime go in the Databricks `nrw` secret scope described above.

### Deploying from your system

Use this when you want to deploy a change from your local system without going through GitHub.

One-time setup:

1. Install the Databricks CLI:

   ```bash
   brew tap databricks/tap
   brew install databricks
   ```

1. Log in via the CLI: `databricks auth login --host https://adb-XXXX.XX.azuredatabricks.net`. See the login section above for more details.

Deploying:

1. From the `data/` directory, validate and deploy. Run inside a subshell that unsets the SP env vars so the CLI uses your SSO identity instead:

   ```bash
   (
     unset DATABRICKS_HOST DATABRICKS_CLIENT_ID DATABRICKS_CLIENT_SECRET DATABRICKS_TOKEN DATABRICKS_CONFIG_PROFILE
     databricks bundle validate --target test
     databricks bundle deploy   --target test
   )
   ```

   Replace `test` with the target environment as needed.

1. Trigger a manual run. Some environments don't run automatically on schedule — see [data/databricks.yml](../databricks.yml) for which have `pause_status: PAUSED`. To start a run:

   ```bash
   databricks bundle run --target test nrw_drought_forecast
   ```

   See [data/databricks.yml](../databricks.yml) for the available job names.

1. View the run in the [Databricks UI](https://accounts.azuredatabricks.net) under **Workflows → Job runs**.

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
│   ├── integration_infra/     # test pipeline-infra + integration with API (using scenarios, bypasses hazard-logic in forecast.py)
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
uv run pytest pipelines/test/integration_infra/     test pipeline-infra + integration with API (using scenarios, bypasses hazard-logic in forecast.py)
```

Unit tests cover alert validation and data submitter logic. Infra integration tests use the `--scenario` flag to bypass `forecast.py`, exercising only the pipeline infrastructure (config parsing, data loading, data submission, output writing). Future `integration_pipeline/` tests will run the full pipeline with controlled mock input data flowing through `forecast.py`.
