# IBF

> [!IMPORTANT]
> This is the repo for IBF v2, which is not in MVP-state yet. Find the old IBF-system repo [here](https://github.com/rodekruis/IBF-system).

IBF is a web app to visualize hazard forecasts. It has a [NestJS backend](./services/api-service) and an [Angular frontend](./portal).

Read our [public documentation](https://github.com/rodekruis/IBF-documentation).

## Getting started

1. Install [NodeJS](https://nodejs.org/en/download)
2. Install [Docker](https://docs.docker.com/get-docker)
3. Clone source code: `git clone https://github.com/rodekruis/IBF.git`
4. Setup env variables `cp .env.example .env` in both `portal` and `services`
5. Start api-service `npm run start:services:detach`
   - Open [http://localhost:4000/api](http://localhost:4000/api) in a web browser to check if the api-service is running
   - Open [http://localhost:4000/docs](http://localhost:4000/docs) in a web browser to access the api-service documentation
6. Start IBF-portal `npm run start:portal`
   - Open [http://localhost:8888](http://localhost:8888) in a web browser to check if the IBF-dashboard is running

---

IBF is published under the open-source [Apache-2.0 license](./LICENSE).
