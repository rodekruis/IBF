# Python + uv base image; Python 3.12 matches the version used in CI (test_pipelines.yml)
FROM ghcr.io/astral-sh/uv:0.9.27-python3.12-bookworm-slim AS base

# Runtime system libraries:
# - libeccodes0: used by the `eccodes`/`cfgrib` packages to read GRIB files
# - libgdal32: runtime linkage for `fiona` when it is compiled from source (see below)
RUN apt-get update && apt-get install -y --no-install-recommends libeccodes0 libgdal32 && rm -rf /var/lib/apt/lists/*

# Non-root user, so that file permissions behave the same as on the host
# (e.g. read-only test fixtures) and deployed containers do not run as root
RUN useradd --create-home --uid 1000 pipelines && mkdir -p /opt/uv && chown pipelines:pipelines /opt/uv

WORKDIR /home/pipelines/app
RUN chown pipelines:pipelines /home/pipelines/app

# Keep the virtual environment outside the app directory, so that bind-mounting
# the host `data/` directory (local development) does not shadow the container
# venv with the (incompatible) host `.venv`, and the container never writes to it.
ENV UV_PROJECT_ENVIRONMENT=/opt/uv/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
ENV PATH="/opt/uv/venv/bin:$PATH"

# Build tooling: `fiona` publishes no linux/arm64 wheel and is compiled from
# source against GDAL on Apple Silicon (on amd64 its wheel is used instead)
FROM base AS build-tools
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libgdal-dev && rm -rf /var/lib/apt/lists/*
USER pipelines

# NOTE: the images run `uv sync --locked` instead of `./uv-sync.sh`: the
# `uv pip install cfgrib` workaround in that script installs a second, bundled
# copy of ecCodes (`eccodeslib`) which conflicts with the system ecCodes loaded
# by GDAL (crash on interpreter exit). cfgrib is part of the lock file, so a
# plain sync installs it correctly.

FROM build-tools AS development

# Install dependencies first (cached layer, invalidated only when the lock file changes)
COPY --chown=pipelines:pipelines ./pyproject.toml ./uv.lock ./
RUN --mount=type=cache,target=/home/pipelines/.cache/uv,uid=1000,gid=1000 \
    uv sync --locked --no-install-project

COPY --chown=pipelines:pipelines . .

RUN --mount=type=cache,target=/home/pipelines/.cache/uv,uid=1000,gid=1000 \
    uv sync --locked

# One-off job semantics, same as production; `docker run` supplies the actual
# pipeline invocation, and `uv run` re-syncs dependencies when the
# bind-mounted lock file has changed
CMD ["uv", "run", "pipeline", "--help"]

FROM build-tools AS production-build

COPY --chown=pipelines:pipelines ./pyproject.toml ./uv.lock ./
RUN --mount=type=cache,target=/home/pipelines/.cache/uv,uid=1000,gid=1000 \
    uv sync --locked --no-dev --no-install-project

COPY --chown=pipelines:pipelines . .

RUN --mount=type=cache,target=/home/pipelines/.cache/uv,uid=1000,gid=1000 \
    uv sync --locked --no-dev

# Deployable image: runtime libraries and the synced venv only, no build tooling
FROM base AS production

COPY --from=production-build --chown=pipelines:pipelines /opt/uv/venv /opt/uv/venv
COPY --from=production-build --chown=pipelines:pipelines /home/pipelines/app /home/pipelines/app

USER pipelines

# Deployments override this command, e.g.: pipeline --config pipelines/infra/configs/floods.yaml
CMD ["pipeline", "--help"]
