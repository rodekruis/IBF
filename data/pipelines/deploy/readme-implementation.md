# Pipeline cloud deployment plan

The general requirements this plan implements are in [readme-requirements.md](readme-requirements.md); this document is the practical implementation overview.

For usage, such as deploying changes or kicking off a deployed pipeline run from the CLI, see `Deployment steps and scripts`.

## Azure resources

See the [NRW-infra](https://github.com/rodekruis/NRW-infra) repo.

### Helper jobs

- `run_pipeline_job.sh` (`function/run_pipeline_job.sh`): Manually kick off a hazard pipeline run for a given environment and hazard. Example: `./function/run_pipeline_job.sh test floods`. This is the same job and parameters as a standard scheduled run of the hazard, using the app settings of that environment's scheduler Function App.
- `mock_run_pipeline_job.sh` (`function/mock_run_pipeline_job.sh`): Run the pipeline with mock data; `--mock` is required and all other arguments are passed through unchanged. See the [pipelines readme](../pipelines/README.md) for possible flags. `./function/mock_run_pipeline_job.sh test floods --mock 1 --country KEN`

## Storage

- **Azure Blob Storage**: GloFAS global downloads (~600 MB per file, ~30 GB total for a daily set of ~50 files), country split outputs, debug/dev data, and large result payloads. Only one GloFAS file is loaded at a time, so peak working storage is ~600 MB–1 GB. All downloaded GloFAS files are written to Blob Storage.

### Blob storage retention

The pipeline writes to subdirectories under `DATA_CACHE_DIR`. Azure Blob lifecycle policies apply per prefix.

- `glofas/raw/{forecast_date}/`
  - Content: global GloFAS downloads
  - Retention: 30 days
- `glofas/country_split/{forecast_date}/`
  - Content: country-split GloFAS data (for development)
  - Retention: indefinite (revisit later)
- `glofas/country_split_alert/{forecast_date}/`
  - Content: country-split data that triggered alerts
  - Retention: indefinite
- `task-logs/{hazard_type}/{job_id}/`
  - Content: Batch task stdout/stderr files
  - Retention: 90 days

## Logging

Logging uses a workspace-based **Application Insights** component backed by the shared **`nrw-app-law`** Log Analytics workspace in the `NRW` resource group

## Environment variables and secrets

### Env vars

Set these in `data/.env`. See `data/.env.example` for which need to be set and which don't for production.

### Key Vault secrets

- `ibf-pipeline-api-key` — API key for the NRW backend (`IBF_PIPELINE_API_KEY`).
- `glofas-ftp-user` — ECMWF GloFAS FTP username (`GLOFAS_FTP_USER`).
- `glofas-ftp-password` — ECMWF GloFAS FTP password (`GLOFAS_FTP_PASSWORD`).

## Out of scope for first prototype

### To do or evaluate after first prototype is running

- **Additional environments**: Only `test` (`IBF_ENVIRONMENT=test`) is used for the prototype. Adjust scripts so they correctly handle other environments. ([Task 44420](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44420))
- **Logging and retention**: Re-eval retention periods for logs and files. ([Task 44421](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44421))
- **"no run" Alerts**: Set up alerts if there were no runs ([Task 44422](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44422))
- **Test Batch account**: Limit mock data runs to a specific account/env to prevent mock runs ever being done on PROD or with non-mock accounts. ([Task 44423](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44423))
- **CI/CD image builds**: Use Github actions to build and push to ACR. ([Task 44424](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44424))
- Re-evaluate the pool autoscale formula ([Task 44425](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44425))

### Specs to evaluate

Tracked in [Task 44426](https://dev.azure.com/redcrossnl/National%20Risk%20Watch/_workitems/edit/44426).

- Be sure the nrw-batch-scheduler runs are safely within the `working memory` limit of 1.5 GB, which can be seen on the [nrw-pipelines-test-rg resource page.](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-pipelines-test-rg/metrics)
- Check the memory and cpu usage of the backend to make sure the pipeline is not causing usage spikes. For example, you can see this [here for nrw-test.](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/NRW/providers/Microsoft.Web/serverfarms/nrw-test/metrics)

### Handle after MVP or as need arises

- **Data caching**: There are two types of data we could cache: PostGis DB data (admin areas, roads, buildings) and static data (population source image). For now, it is pulled from the backend.
