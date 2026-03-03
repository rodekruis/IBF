# IBF

> [!IMPORTANT]
> This is the repo for IBF v2, which is not in MVP-state yet. Find the old IBF-system repo [here](https://github.com/rodekruis/IBF-system).

IBF is a web app to visualize hazard forecasts. It has [data pipelines](./pipelines), a [NestJS backend](./services/api-service), and a React frontend, which is in a [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main).

Read our [documentation](https://github.com/rodekruis/IBF-documentation).

## Getting started

1. Install [NodeJS](https://nodejs.org/en/download)
2. Install [Docker](https://docs.docker.com/get-docker)
3. Clone source code: `git clone https://github.com/rodekruis/IBF.git`
4. Start api-service

- Setup env variables `cp services/.env.example services/.env`
- Start api-service `npm run start:services:detach`
- Open [http://localhost:4000/docs](http://localhost:4000/docs) in a web browser to access the api-service documentation

5. Start portal > see [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main)

6. Start pipelines

- Install [uv](https://docs.astral.sh/uv/getting-started/installation)
- `cd pipelines`
- `cp .env.example .env` and fill in correct values. (NOTE: for CKAN_KEY get an API-token from the used CKAN, such as HDX)
- `uv sync`
- `uv pip install cfgrib` (even though listed as dependency, this needs a separate install for now)
- `uv run pipeline.py --hazard drought --country KEN --prepare --forecast --send --debug`

---

IBF is published under the open-source [Apache-2.0 license](./LICENSE).
