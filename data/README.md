# About

This is directory handles pipeline and other data management scripts in Python.

## Structure

### Pipelines

Pipeline code used for creating forecasts

#### Components

- [`pipelines/core`](pipelines/core): core framework and shared utilities to forecast hazard impact.
- [`pipelines/drought`](pipelines/drought): drought pipeline
- [`pipelines/riverflood`](pipelines/riverflood): river flood pipeline

### Data_management

A collection of scripts to upload or transform data.
See the summary in each script for the purpose.

### Shared

Classes and utils shared between the python projects.

## Prerequisites

**Python:** Install 3.12 or higher. Normally it's best to grab latest 3.x (unless we find there is a breaking change).
**UV:** Go to their [GitHub page](https://github.com/astral-sh/uv/releases) and either grab the binaries or copy the `curl` command from there to install locally. An example curl command:
`curl --proto '=https' --tlsv1.2 -LsSf https://releases.astral.sh/github/uv/releases/download/0.10.9/uv-installer.sh | sh`

## Setup

1. Navigate to the <repo root>/data/ directory and install all python dependencies with `uv sync` to sync with the package versions, or `pip3 install .` to get the latest of all listed packages.
1. Copy the `.env.example` file, and rename it to `.env`

### Additional setup for updating the seed repo

To update the [seed data repo](https://github.com/rodekruis/IBF-seed-data), you need a local copy. You make changes to the local copy and push those like normal changes. Follow these steps to set this up:

It's recommended to clone the repo into the same parent dir as the IBF/ repo. If not, you'll need to change the `SEED_DATA_REPO_ROOT` .env var to point to the different location.

## Updating the dependencies

If you add a python dependency, you need to add it in `pyproject.toml`. If you forget, this will get flagged automatically on your PR. You also need to update the uv.lock file (which is not flagged automatically).

Commands to update the uv.lock file:

- `uv lock`: Sync the dependencies with the `pyproject.toml` file.
- `uv lock --upgrade`: Does the same as above, but also upgrades all packages to the latest version.

## Quality checks

Run a Python Knip-like audit: `uv run python-knip`

`python-knip` runs:

- `deptry` for dependency usage checks
- `ruff check` for lint and unused imports/variables
- `vulture` for likely dead code
