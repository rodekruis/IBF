# IBF

> [!IMPORTANT]
> This is the repo for IBF v2, which is not in MVP-state yet. Find the old IBF-system repo [here](https://github.com/rodekruis/IBF-system).

IBF is a web app to visualize hazard forecasts. It has [data pipelines](./pipelines), a [NestJS backend](./services/api-service), and a React frontend, which is in a [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main).

Read our [documentation](https://github.com/rodekruis/IBF-documentation).

## Getting started

1. Setup

- Install [NodeJS](https://nodejs.org/en/download)
- Install [Docker](https://docs.docker.com/get-docker)
- Clone source code: `git clone https://github.com/rodekruis/IBF.git`

2. Start api-service

- Setup env variables `cp services/.env.example services/.env`
- Start api-service `npm run start:services:detach` which runs the `docker-compose` file as well.
- Open [http://localhost:4000/docs](http://localhost:4000/docs) in a web browser to access the api-service documentation
- You can also see the map services running locally of pg_featureserv (GIS feature service) at [http://localhost:9000/](http://localhost:9000/) and pg_tileserv (vector tile service) at [http://localhost:7800/](http://localhost:7800/)

3. Start portal > see [separate repo](https://github.com/rodekruis/go-web-app/tree/ibf-main)

4. Start pipelines

See the [data/ folder readme](/data/README.md) for setup.

- Install [uv](https://docs.astral.sh/uv/getting-started/installation)

5. Seed data for the DB

This is under construction. There are currently some seeding scripts in `data/data_management/data_upload` for dev use. See the [data/ folder readme](/data/README.md) for more information.

---

IBF is published under the open-source [Apache-2.0 license](./LICENSE).
