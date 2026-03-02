# IBF

> [!IMPORTANT]
> This is the repo for IBF v2, which is not in MVP-state yet. Find the old IBF-system repo [here](https://github.com/rodekruis/IBF-system).

IBF is a web app to visualize hazard forecasts. It has a [NestJS backend](./services/api-service), an [Angular frontend](./portal), and [data pipelines](./pipelines).

Read our [documentation](https://github.com/rodekruis/IBF-documentation).

## Getting started

1. Setup

- Install [NodeJS](https://nodejs.org/en/download)
- Install [Docker](https://docs.docker.com/get-docker)
- Install [git-lfs](https://git-lfs.com) and initialize through `git lfs install`
- Clone source code: `git clone https://github.com/rodekruis/IBF.git`

2. Start api-service

- Setup env variables `cp services/.env.example services/.env`
- Start api-service `npm run start:services:detach`
- Open [http://localhost:4000/docs](http://localhost:4000/docs) in a web browser to access the api-service documentation

3. Start portal

- `cp portal/.env.example portal/.env`
- `npm run install:portal`
- `npm run start:portal`
- Open [http://localhost:8888](http://localhost:8888) in a web browser to check if the IBF-portal is running

4. Start pipelines

- Install [uv](https://docs.astral.sh/uv/getting-started/installation)
- `cd pipelines`
- `cp .env.example .env` and fill in correct values. (NOTE: for CKAN_KEY get an API-token from the used CKAN, such as HDX)
- `uv sync`
- `uv pip install cfgrib` (even though listed as dependency, this needs a separate install for now)
- `uv run pipeline.py --hazard drought --country KEN --prepare --forecast --send --debug`

---

IBF is published under the open-source [Apache-2.0 license](./LICENSE).
