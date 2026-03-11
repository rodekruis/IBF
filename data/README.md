# Pipelines

Forecast hazards impact on people and assets.

## Components

- [`pipelines/core`](pipelines/core): core framework and shared utilities to forecast hazard impact.
- [`pipelines/drought`](pipelines/drought): drought pipeline
- [`pipelines/riverflood`](pipelines/riverflood): river flood pipeline

## Quality checks

Run a Python Knip-like audit: `uv run python-knip`

`python-knip` runs:

- `deptry` for dependency usage checks
- `ruff check` for lint and unused imports/variables
- `vulture` for likely dead code
