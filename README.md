# IBF

> [!IMPORTANT]
> This is the repo for IBF v2, which is not in MVP-state yet. Find the old IBF-system repo [here](https://github.com/rodekruis/IBF-system).

A system that forecasts Early Warning alerts, disseminates notifications, and visualizes exposure information to support decision making, following the country advisory. It has:

- [data pipelines](./pipelines) producing forecasts
- [back-end services](./services) ingesting and processing forecast data via API and publishing this - alongside seed data - via APIs
- to e.g. a React front-end, which is in a [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main).

Read our [documentation](https://github.com/rodekruis/IBF-documentation).

## Getting started

1. Setup

- Install [NodeJS](https://nodejs.org/en/download)
- Install [Docker](https://docs.docker.com/get-docker)
- Clone source code: `git clone https://github.com/rodekruis/IBF.git`
- Run `npm install` in root folder

2. Start services

- Setup env variables `cp services/.env.example services/.env`
- Start services with `npm run start:services:detach`.
- Open
  - [http://localhost:4000/docs](http://localhost:4000/docs) to access the `api-service` documentation
  - [http://localhost:9000/](http://localhost:9000/) for pg_featureserv (GIS feature service)
  - [http://localhost:7800/](http://localhost:7800/) for pg_tileserv (vector tile service)

3. Start portal > see [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main)

4. Start pipelines

See the [data/ folder readme](/data/README.md) for setup.

5. Seed data for the DB

This is under construction. There are currently some seeding scripts in `data/data_management/data_upload` for dev use. See the [data/ folder readme](/data/README.md) for more information.

## Troubleshooting

### When running locally, `api-service` tries to connect to the wrong local port for the DB (localhost:5432)

- This can happen if you run `docker compose up` to start services, since Prisma may not get the correct env setting. Instead, always launch the services with `npm run start:services:detach`.

---

IBF is published under the open-source [Apache-2.0 license](./LICENSE).
