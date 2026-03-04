#!/bin/sh
uv sync
uv pip install cfgrib # Even though included in pyproject.toml, it is not installed by default. This is a workaround to ensure it is available for the pipelines.
