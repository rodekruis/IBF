# About

This is directory handles pipeline and other data management scripts in Python.

## Setup

1. 

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

## Quality checks

Run a Python Knip-like audit: `uv run python-knip`

`python-knip` runs:

- `deptry` for dependency usage checks
- `ruff check` for lint and unused imports/variables
- `vulture` for likely dead code
