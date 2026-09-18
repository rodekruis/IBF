# Deploy image for the Batch pipeline (linux/amd64).
FROM ghcr.io/astral-sh/uv:0.9.27-python3.12-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends libeccodes0 libgdal32 nodejs npm && rm -rf /var/lib/apt/lists/*
RUN npm install --global mapshaper@0.7.59

WORKDIR /app
COPY . .
RUN uv sync --locked --no-dev

CMD ["uv", "run", "pipeline", "--help"]
