# IBF

> [!IMPORTANT]
> This is the repo for IBF v2, which is not in MVP-state yet. Find the old IBF-system repo [here](https://github.com/rodekruis/IBF-system).

A system that forecasts Early Warning alerts, disseminates notifications, and visualizes exposure information to support decision making, following the country advisory. It has:

- [data pipelines](./pipelines) producing forecasts
- [back-end services](./services) ingesting and processing forecast data via API and publishing this - alongside seed data - via APIs
- to e.g. a React front-end, which is used in the [NRW standalone front end](/portal/nrw-standalone/README.md) in this repo, but development for it is done in a [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main).

Read our [public documentation](https://github.com/rodekruis/IBF-documentation).

## Getting started

To get IBF installed locally run this script and follow any instructions it gives `scripts/initial_setup/initial_setup.sh`.

This guide is a text version of that script which will help you troubleshoot or fix a broken local installation, although a wipe and reinstall shouldn't take more than 5 minutes.

### 1. Prerequisites

- [git](https://git-scm.com/install/mac)
- [Docker](https://docs.docker.com/get-docker)
- [NodeJS v22+](https://nodejs.org/en/download)v22+
- [pnpm](https://pnpm.io/)
- Python 3.12+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [GDAL](https://gdal.org)

### 2. Clone and install dependencies

Because IBF needs 3 repositories you'll probably want to have them in an umbrella folder next to each other.

- backend (including pipelines): https://github.com/rodekruis/IBF
- frontend (etc): https://github.com/rodekruis/go-web-app/tree/ibf-main
- seed data: https://github.com/rodekruis/IBF-seed-data

#### Backend (`IBF` repository)

In the `IBF` repository

- `cp services/.env.example services/.env`
- `npm install`

Run the backend with logs to stdout: `npm run start:services`
Run the backend without logs in stdout: `npm run start:services:detach`
Stop the backend: `npm run stop:services`

The following URLs are now available

- [http://localhost:4000/docs](http://localhost:4000/docs) to access the `api-service` documentation
- [http://localhost:9000/](http://localhost:9000/) for pg_featureserv (GIS feature service)
- [http://localhost:7800/](http://localhost:7800/) for pg_tileserv (vector tile service)

#### Frontend (`go-web-app` directory)

In the `go-web-app` directory, follow [the instructions from that repository](https://github.com/rodekruis/go-web-app/tree/ibf-main#local-development) on how to install dependencies and start the frontend.

#### Pipelines (`IBF/data`)

The code for the pipelines lives in the `IBF` repository under `/data`.

The pipelines are under construction. See the [readme](/data/README.md) for setup.

#### Seed data (`ibf-seed-data`)

This is under construction. There are currently some seeding scripts in `data/data_management/data_upload` for dev use. See the [data/ folder readme](/data/README.md) for more information.

## Troubleshooting

### When running locally, `api-service` tries to connect to the wrong local port for the DB (localhost:5432)

This can happen if you run `docker compose up` to start the backend services, since Prisma may not get the correct env setting. Instead, always launch the services with `npm run start:services:detach`.

---

IBF is published under the open-source [Apache-2.0 license](./LICENSE).
