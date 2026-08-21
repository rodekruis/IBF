# Pipeline Deploy Requirements

These are the general requirements. See [deploy.md](deploy.md) for the practical implementation overview.

## Basic flow (MVP)

1. A single python pipeline job runs, does the downloads needed, and processes data for each country. No extra orchestration is needed there. There is one job run per hazard, once per day.
2. Data is loaded from GloFAS for the whole world (30GB).
3. Data is split into per-country chunks for the supported countries.
4. Data is loaded from cache (since it is updated generally less than once a year): admin areas 100-200MB, population data 50-100MB, road/building data (after MVP) expected between 10MB to 2GB.
5. Forecast pipeline is run to calculate impact.
6. Results are sent to the separately maintained backend (small payload expected for MVP, under 10MB, but after MVP this can be much larger when roads/buildings data is added, so 100-200MB might be reasonable).
7. Logs from a run are saved for later use.
8. Some GloFAS data is saved for different periods (debug, dev, review purposes).

## Requirements

- The above flow needs to be supported, but also the option to add other jobs and data sources in the future.
- Reliability is the highest priority, even if the reliability needs are not that strict (can run at least once per day; retries are fine as long as it runs that day). Supportability/maintainability are next. Cost comes after that.
- Retries are done inside the pipeline job itself (e.g. download retries with backoff). A full job failure is not retried automatically; monitoring/alerting on full job failures will be added instead.
- We will need to support other jobs in the future that will call from other data sources, some of which are not expected to be perfectly reliable. The system we pick should be flexible enough to handle these new jobs.
- Live or near-live monitoring of long running jobs (such as the long running GloFAS download job). I think Kusto should cover this, but we'd need to verify delay. 5 minute delay should be fine, but several hours delay will make our work difficult.

## UI requirements

- Easily accessible logs (Kusto queries are fine). It would be nice to have Kusto dashboard visualizations (charts, etc.).
- UI (GUI) showing a history of run and failed jobs.
- A documented way to rerun jobs manually that devs, the data team, and PMs can all use (in addition to scheduled runs).

## Team needs

- **Dev team**: Manages the flow, triages the issues, and supports the code. More of the deployment setup being in code is better since we already have lots of the infra in code, and it is easier for LLMs to help with support if deployment infra is in code.
- **Data team**: Should be able to query logs, access stored primary data (GloFAS, etc.) and kick off new runs. It is easiest for them to do their investigations locally (such as code changes and running the pipeline with different data input). The debug flow should be as smooth as possible: see error (in Kusto or email or Teams, etc.), then download source data from DB, then run locally.
- **PM**: Can look into the Azure UI and see run history, query logs, and retry a job that failed.

## Data storage

> Note: Periods below are just what we'd start with. We can re-evaluate retention periods as needed.

- For text logs, there will be no PII. If possible, we want a long retention policy: 180 days if possible, but 90 days might be fine. 30 is too short.
- We will want to save GloFAS data for N days for debugging. For the start, all country-split GloFAS data should be saved for a month.
- We might want to save some data for longer. For the start, save country-split GloFAS data for runs that resulted in an alert (minimum severity threshold passed to send the data to the backend) until deleted. If we set a period on this, it might be 2 years or more.
- Note we'll also need to save NOAA data.

## Cache

- **DB cache**: Since we need lots of data from the front end DB, and that data is rarely ever updated, it may be better to cache the DB. This becomes more likely when we use road/building data. For now, we'll start with no DB cache, and evaluate this as needed.
- We have no endpoint or place we host the population PNG data yet. This can start as a blob storage cache the backend has, or can be another system. All population data is under 2GB for MVP.

## Lessons learned from IBF v1

Here are the key issues we want to avoid in v2 that we learned from v1:

- Datasource can go down or change format without warning. **V2 solution**: Rely on one, dependable main forecast data source (GloFAS). Other unreliable data sources are used as optional sources, possibly only on other forecast (python) jobs that aren't required to be perfectly dependable. Other sources may be cached and maintained by us (roads, admin areas, population data, etc.).
- Code/process was spread between many repos. **V2 solution**: Centralize the flow into one repo.
- Inconsistent logging, loss of files needed for debugging. **V2 solution**: Multiple steps of the process to validate data and log issues. Retain data for a set period to be able to debug runs locally.
- Lack of unit and e2e tests.
- Lack of shared expertise across the team to be able to debug infrastructure issues.
- Lack of adequate monitoring. **V2 solution**: Monitor both when alerts are produced, but also know pipeline health when no alerts are being produced.
- Lack of feedback/output when an event is below threshold. **V2 solution**: The minimum alert level is low enough so that we will be able to see our output even when an event is below the standard trigger level used in IBFv1.
- Inconsistent forecast flows for different countries that are hard to maintain. **V2 solution**: Our focus is on one shared, dependable flow that we want always working. Custom flows can be added after MVP, but they are no longer the core of our product.
