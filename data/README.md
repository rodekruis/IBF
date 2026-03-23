# About

This directory handles pipeline and other data management scripts in Python.

## Structure

### Pipelines

Pipeline code used for creating forecasts. See [pipelines/README.md](pipelines/README.md) for further info.

### Data_management

A collection of scripts to upload or transform data, including populating the seed data repo, or populating the DB used for IBF. The latter is for now done only for develop/test/prototype purposes. This is reflected by this data being uploaded in the 'public' schema of the database, as opposed to Nest.js/Prisma-managed 'api-service' schema, where eventually the full datamodel will (likely) go.

See the summary in each script for the purpose.

To run data upload scripts, you'll need to set up a local DB. See the `<repo root>/services/docker-compose` file.

**Note:** Some of work done (as of March 2026) needs refinement still, noticeably these changes:

- Centralize table schema, table creation, initial table data population
- Better structure for the data management python files (https://dev.azure.com/redcrossnl/IBF/_workitems/edit/41201)

See TODOs in code, or tasks in ADO for more details.

### Shared

Classes and utils shared between the python projects.

## Prerequisites

- **Python:** Install 3.12 or higher. Normally it's best to grab latest 3.x (unless we find there is a breaking change).

- **UV:** Go to their [GitHub page](https://github.com/astral-sh/uv/releases) and either grab the binaries or copy the `curl` command from there to install locally. An example curl command:
  `curl --proto '=https' --tlsv1.2 -LsSf https://releases.astral.sh/github/uv/releases/download/0.10.9/uv-installer.sh | sh`

- **HomeBrew Package Manager** (Need for Mac users only) Install instructions are on their [homepage](https://brew.sh/). This is needed for the GDAL installation.

- **GDAL library** This has a lot of dependencies, so it will take a long time to download this.For Mac users: run this in terminal: `brew install gdal`. For Windows users, you can get this via the [OSGeo4W installer](https://trac.osgeo.org/osgeo4w/)

## Setup

1. Navigate to the <repo root>/data/ directory and install all python dependencies with `./uv-sync.sh`.
2. Copy the `.env.example` file, and rename it to `.env`

### Additional setup for updating the seed repo

To update the [seed data repo](https://github.com/rodekruis/IBF-seed-data), you need a local copy. You make changes to the local copy and push those like normal changes. Follow these steps to set this up:

It's recommended to clone the repo into the same parent dir as the IBF/ repo. If not, you'll need to change the `SEED_DATA_REPO_ROOT` .env var to point to the different location.

## Updating the dependencies

If you add a python dependency with `pip`, the project dependencies may become out of date. The ideal flow to add dependencies is:

1. Add the package name to `dependencies` in `pyproject.toml`
2. Navigate to <repo root>/data in terminal and call `uv sync` to sync both your environment and the `uv.lock` file.

There is a scan when you PR to check `pyproject.toml` for missing dependencies, but it doesn't scan the `uv.lock` file.

To upgrade all packages in the `uv.lock` file to the latest, run `uv lock --upgrade`, although this means everything will need to be retested.

## Running the forecast pipelines

From the `<repo root>/data/` dir, you can run the pipeline from command line, for example with: `uv run pipeline.py --hazard drought --country KEN --prepare --forecast --send --debug`

## Quality checks

Run a Python Knip-like audit: `uv run python python-knip.py`

Add `--fix` to auto-fix what can be auto-fixed: `uv run python python-knip.py --fix`

`python-knip.py` runs:

- `deptry` for dependency usage checks
- `ruff check` for lint and unused imports/variables
- `vulture` for likely dead code
