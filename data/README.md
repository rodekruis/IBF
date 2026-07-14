# About

This directory handles pipeline and other data management scripts in Python.

## Structure

### Pipelines

Pipeline code used for creating forecasts. See [pipelines/README.md](pipelines/README.md) for further info.

### Data_management

A collection of scripts to upload or transform data, including populating the seed data repo, and for develop/test/prototype purposes, populating the DB used for IBF. See the [data_management/README](./data_management/README.md) for more details.

### Shared

Classes and utils shared between the python projects.

## Prerequisites

- **Python:** Install 3.12 or higher. Normally it's best to grab latest 3.x (unless we find there is a breaking change).

- **UV:** Go to their [GitHub page](https://github.com/astral-sh/uv/releases) and either grab the binaries or copy the `curl` command from there to install locally. An example curl command:
  `curl --proto '=https' --tlsv1.2 -LsSf https://releases.astral.sh/github/uv/releases/download/0.10.9/uv-installer.sh | sh`

- **HomeBrew Package Manager** (Need for Mac users only) Install instructions are on their [homepage](https://brew.sh/). This is needed for the GDAL installation.

- **GDAL library** This has a lot of dependencies, so it will take a long time to download this.For Mac users: run this in terminal: `brew install gdal`. For Windows users, you can get this via the [OSGeo4W installer](https://trac.osgeo.org/osgeo4w/)

- **ecCodes library** Required by the `cfgrib` package for reading GRIB files (used by GloFAS data). For Mac users: `brew install eccodes`.

## Setup

1. Navigate to the <repo root>/data/ directory and install all python dependencies with `./uv-sync.sh`.
2. Copy the `.env.example` file, and rename it to `.env`

### Additional setup for updating the seed repo

To update the [seed data repo](https://github.com/rodekruis/IBF-seed-data), you need a local copy. You make changes to the local copy and push those like normal changes. Follow these steps to set this up:

It's recommended to clone the repo into the same parent dir as the IBF/ repo. If not, you'll need to change the `SEED_DATA_REPO_ROOT` .env var to point to the different location.

## Updating the dependencies

If you add a python dependency with `pip`, the project dependencies may become out of date. The ideal flow to add dependencies is:

1. Add the package name to `dependencies` in `pyproject.toml`
2. Navigate to <repo root>/data in terminal and call `./uv-sync.sh` to sync both your environment and the `uv.lock` file.

There is a scan when you PR to check `pyproject.toml` for missing dependencies, but it doesn't scan the `uv.lock` file.

To upgrade all packages in the `uv.lock` file to the latest, run `uv lock --upgrade`, although this means everything will need to be retested.

## Running the forecast pipelines

From the `<repo root>/data/` dir, you can run the pipeline from command line, for example with: `uv run pipeline --config pipelines/infra/configs/drought.yaml --mock 1 --country ETH`. See the [pipelines README](pipelines/README.md) for the full set of flags.

## Running in Docker

The pipelines can also run inside Docker, fully independent of the backend services stack: there is no compose service for them — the [Dockerfile](Dockerfile) is self-contained, and the only link to the api-service is the `IBF_API_URL` environment variable (plain HTTP). The Dockerfile has a `development` target (source bind-mounted) and a `production` target (self-contained, deployable image).

The pipelines are not a server: every invocation is a one-off job (`docker run --rm`) that runs to completion and removes its container — there is nothing to start or stop, and the backend services (`npm run start:services`) are unaffected.

### Local development

From the repo root, pass pipeline flags after `--`:

```bash
npm run start:pipelines -- --config pipelines/infra/configs/floods.yaml --country ETH --mock 1
npm run test:pipelines           # run the unit tests in a one-off container
```

Each run bind-mounts `data/` into `/home/pipelines/app`, so code changes on the host are picked up immediately — no rebuild needed. `uv run` re-syncs dependencies from `uv.lock` when it changed. The container venv lives at `/opt/uv/venv` (via `UV_PROJECT_ENVIRONMENT`), completely separate from the host `.venv`, so host and container environments never interfere. Pipeline runs submit to whatever `IBF_API_URL` points at — start the api-service first (`npm run start:services`) or point at a deployed API.

Anything you run on the host with `uv run ...` can be run as a one-off container with `docker run --rm ...` (from the repo root):

```bash
docker build --tag=pipelines:development --target=development data/
RUN="docker run --rm --init --network=host --volume=$PWD/data:/home/pipelines/app"

# run a pipeline against the api-service on localhost:4000 (same as npm run start:pipelines --)
$RUN pipelines:development uv run pipeline --config pipelines/infra/configs/floods.yaml --country ETH --mock 1

# tests
$RUN pipelines:development uv run pytest pipelines/test/unit/
$RUN pipelines:development uv run pytest pipelines/test/integration_infra/
$RUN pipelines:development uv run pytest pipelines/test/integration_pipeline/

# quality checks
$RUN pipelines:development uv run python python-knip.py

# interactive shell (exit removes the container)
$RUN --interactive --tty pipelines:development bash
```

The integration tests submit forecasts to the api-service, which requires seed data. Reset the database first (same as CI):

```bash
curl -X POST "http://localhost:4000/api/reset?script=ethiopia-only&resetIdentifier=local" \
  -H "Content-Type: application/json" \
  -d '{"secret":"<RESET_SECRET from services/.env>"}'
```

> [!NOTE]
> The containers run with `--network=host`, sharing the Docker host's network, so the `http://localhost:4000` value in `data/.env` reaches the api-service exactly like a host run — no override needed. The pipelines bind no ports, so there is no conflict risk. Host networking is native on Linux; Docker Desktop supports it since 4.34 (if it fails, check Settings → Resources → Network → "Enable host networking"). All values are read by `load_dotenv()` from the bind-mounted `data/.env` file (do not use docker's `--env-file` for it: docker does not strip the quotes around dotenv values). Keep `data/.env` in sync with `.env.example` — the pipeline needs `IBF_ENVIRONMENT`, `DATA_CACHE_DIR` and `IBF_PIPELINE_API_KEY` to be present.

> [!IMPORTANT]
> Full pipeline runs (`--mock` without `--infra-only`, LIVE runs, and the `integration_infra`/`integration_pipeline` tests) decode the country-wide population raster into memory, which peaks at roughly 6–8 GB per process. Give the Docker VM (Docker Desktop → Settings → Resources) at least ~12 GB of memory for these; otherwise the process is OOM-killed (exit code 137 / `assert -9 == 0` in tests). Unit tests and `--infra-only` runs need far less. CI runners have 16 GB and are unaffected.

### Dependency changes

The Docker images install dependencies with a plain `uv sync --locked` instead of `./uv-sync.sh`: the `uv pip install cfgrib` workaround in that script installs a second, bundled copy of the ecCodes C library (`eccodeslib`) that conflicts with the system ecCodes used by GDAL inside the image (crash on interpreter exit). `cfgrib` is in `uv.lock`, so the plain sync installs it correctly.

After changing `pyproject.toml`/`uv.lock`, nothing extra is needed in development: `uv run` re-syncs the container venv on the next run. Production images bake dependencies in at build time, so rebuild those.

### Deployable image

The `production` target contains the code and dependencies only — no bind mounts, no build tooling — and runs as a non-root user:

```bash
# build (from the repo root)
docker build --tag=pipelines --target=production data/

# run a pipeline (no .env is baked into the image — inject the variables from
# the table below at runtime; IBF_API_URL points at the target API)
docker run --rm --init \
  --env=IBF_ENVIRONMENT=development \
  --env=IBF_API_URL=https://<deployed-api-host> \
  --env=IBF_PIPELINE_API_KEY=<PIPELINE_API_KEY of the target API> \
  --env=GITHUB_DATA_BASE_URL=https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main \
  --env=DATA_CACHE_DIR=./data/ \
  pipelines pipeline --config pipelines/infra/configs/floods.yaml --country ETH --mock 1
```

To test the production image against the local backend, add `--network=host` and use `--env=IBF_API_URL=http://localhost:4000`.

The default command is `pipeline --help`; deployments override it with the pipeline invocation for the hazard type being scheduled. Containers are one-off jobs, not servers: the process runs to completion, the container exits, and its exit code is the pipeline's — suitable for schedulers (cron, CI, container job services).

### Environment variables

All variables are read from `data/.env` (see [.env.example](.env.example)). `load_dotenv()` never overrides variables that are already set in the process environment, which is how the docker `--env` flags inject container-specific values.

| Variable                    | Example                                                                     | Description                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IBF_ENVIRONMENT`           | `development`                                                               | Deployment environment (`development` / `test` / `production`). Mock runs are disallowed in `production`.                                                                   |
| `IBF_API_URL`               | `http://localhost:4000`                                                     | Base URL of the IBF API. Same value on the host and inside containers (they run with `--network=host`); point at a deployed API URL to submit elsewhere.                    |
| `IBF_PIPELINE_API_KEY`      | `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`                                          | API key for submitting forecasts. Must equal `PIPELINE_API_KEY` in `services/.env`.                                                                                         |
| `GITHUB_DATA_BASE_URL`      | `https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main` | Base URL of the seed-data repo, used to download mock/static input data.                                                                                                    |
| `SEED_DATA_REPO_ROOT`       | `../../IBF-seed-data/`                                                      | Path to a local clone of the seed-data repo. Only used by `data_management` scripts on the host; not needed inside the container.                                           |
| `GLOFAS_FTP_HOST`           | `aux.ecmwf.int`                                                             | GloFAS FTP host. Only needed for LIVE flood runs (no `--mock`).                                                                                                             |
| `GLOFAS_FTP_USER`           | `<fill-in>`                                                                 | GloFAS FTP username (LIVE flood runs).                                                                                                                                      |
| `GLOFAS_FTP_PASSWORD`       | `<fill-in>`                                                                 | GloFAS FTP password (LIVE flood runs).                                                                                                                                      |
| `GLOFAS_FTP_ENSEMBLE_COUNT` | `51` (default)                                                              | Optional; number of GloFAS ensemble members to download.                                                                                                                    |
| `DATA_CACHE_DIR`            | `./data/`                                                                   | Directory for cached downloads (GloFAS files etc.), relative to `data/`. In the dev container this resolves inside the bind mount, so cache files are shared with the host. |

> [!WARNING]
> `data/.env` holds real credentials (FTP) and is excluded from the Docker build context via [.dockerignore](.dockerignore) — it must never be baked into an image. It reaches development containers only through the bind mount; deployed containers get their variables injected at runtime.

## Quality checks

Run a Python Knip-like audit: `uv run python python-knip.py`

Add `--fix` to auto-fix what can be auto-fixed: `uv run python python-knip.py --fix`

`python-knip.py` runs:

- `deptry` for dependency usage checks
- `ruff check` for lint and unused imports/variables
- `vulture` for likely dead code
