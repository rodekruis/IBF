# Pipeline operations

How to start, monitor and debug pipeline jobs in Azure. See the [deployment README](README.md) for how it all fits together, and for the resource names per environment.

## Manually starting a job

The scripts below submit a one-off job to the Azure Batch pool of an environment (`test`, `staging` or `prod`). The job gets exactly the same settings as the scheduled run of that environment: the scripts read them from its scheduler Function App. No local `.env` is needed. Logs of these jobs have run origin `manual`.

### Prerequisites

- `az login` with an identity that has, for the target environment:
  - `Azure Batch Job Submitter` on the Batch account
  - `Key Vault Secrets User` on the Batch Key Vault
  - `Website Contributor` on the scheduler Function App (listing app settings is a write-level action)
- `uv` installed.

### Live data run

Runs the same job as the scheduled run, with live data (e.g. GloFAS for floods). From `data/pipelines/deploy/`:

```bash
./function/run_pipeline_job.sh test floods
```

### Mock data run

`--mock` is required; all other arguments are passed to the pipeline unchanged (see the [pipelines README](../README.md#running-a-pipeline) for the flags). Mock runs are rejected in production.

```bash
./function/mock_run_pipeline_job.sh test floods --mock 1 --country KEN
```

Both scripts print the ID of the submitted Batch job.

## Checking job status

In the environment's Batch account:

- **Jobs**: one job per run, named `nrw-<hazard>-<yyyymmdd-HHMMSS>`. Open the job, then its task, to see its state, exit code and (while the node is still running) its `stdout.txt` and `stderr.txt`.
- **Pools**: node counts and resize errors, for jobs that stay queued without starting.

Test and staging share a Batch account. To see which environment a job belongs to, check `IBF_ENVIRONMENT` in the task's environment settings.

## Logs

### Application Insights

Open **Logs** on the environment's Application Insights component. It contains both the pipeline logs (role name `nrw-pipeline`) and the scheduler Function App logs (role name = Function App name).

> [!NOTE]
> Test and staging share one Application Insights component, and their pipeline logs both have role name `nrw-pipeline`, so these cannot be told apart in the logs yet.

All warnings and errors in a time range:

```kusto
union traces, exceptions
| where timestamp between (datetime(2026-10-19T11:30Z) .. datetime(2026-10-19T14:00Z))
| where severityLevel >= 2
| order by timestamp asc
```

Each pipeline log message starts with a tag (`tag_<name>`, see `LogTag` in `pipelines/infra/utils/nrw_logger.py`) and a live-or-mock marker (`data_live` / `data_mock`). The run origin (`scheduled`, `manual`, `local`) is in `customDimensions.run_origin`. For example, all logs of scheduled live runs:

```kusto
traces
| where message has "data_live"
| where customDimensions.run_origin == "scheduled"
| order by timestamp desc
```

### Which countries ran for a hazard

Per country: how often its forecast started, completed and failed, and its latest status. A latest status of `started` means the forecast did not finish: it crashed, timed out or is still running. Set `hazard` and `lookback` at the top.

```kusto
let hazard = "floods";
let lookback = 2d;
traces
| where timestamp > ago(lookback)
| where cloud_RoleName == "nrw-pipeline"
| where message has "tag_infra"
| extend
    country = extract(@"for '([A-Z]{3})'", 1, message),
    dataMode = extract(@"data_(\w+)", 1, message),
    runOrigin = tostring(customDimensions.run_origin),
    status = case(
        message contains strcat("Forecast '", hazard, "' for"), "started",
        message contains strcat("Completed '", hazard, "' for"), "completed",
        message contains "Errors for", "failed",
        "")
| where isnotempty(status) and isnotempty(country)
| summarize
    started = countif(status == "started"),
    completed = countif(status == "completed"),
    failed = countif(status == "failed"),
    arg_max(timestamp, status)
    by country, runOrigin, dataMode
| project country, runOrigin, dataMode, lastStatus = status, lastSeen = timestamp, started, completed, failed
| order by lastStatus desc, country asc
```

The `Errors for '<country>'` log line does not include the hazard. If several hazards ran in the lookback period, narrow it down to the run you are interested in.

### Pipeline and backend logs together

All Application Insights components write to the shared `nrw-app-law` Log Analytics workspace, so you can query pipeline and backend logs together there. The pipeline's requests to the API carry the headers `x-nrw-pipeline-run-origin` and `x-nrw-pipeline-source-target` (`live` / `mock`), so pipeline runs can also be traced on the backend side.

The workspace uses a different schema (`AppTraces`, `AppRequests`, `TimeGenerated`, `Message`, `AppRoleName`). Backend role names are `nrw-test`, `nrw-staging` and `nrw-prod`. For example, for test:

```kusto
union
    (AppRequests
     | where AppRoleName == "nrw-test"
     | where OperationName has "POST /api/alerts"
     | extend Component = "Backend API",
              Message = strcat(Name, " -> ", ResultCode)),
    (AppTraces
     | where AppRoleName == "nrw-test"
     | where Message has "/api/alerts"
     | extend Component = "Backend API"),
    (AppTraces
     | where AppRoleName == "nrw-pipeline"
     | where Message has "KEN"
     | extend Component = "Pipeline")
| where TimeGenerated > ago(2d)
| order by TimeGenerated asc
| project TimeGenerated, Component, Message
```

### Saving queries

To make a query reusable for the team, use **Save → Save as query** in the Logs blade, with category `NRW pipelines`. Saved queries are shared through a query pack and show up under **Queries** for everyone with access.

For a query with parameters, such as the hazard above, use **Save → Save as function** in the `nrw-app-law` workspace instead (rewritten to the workspace schema). It can then be called by name, e.g. `PipelineCountryStatus("floods")`.

To get new queries quickly, ask an LLM: select an existing query, add `pipelines/infra/utils/nrw_logger.py` and `pipelines/infra/run_forecasts.py` as context for the log tags and messages, and describe what you want to see.

### Raw task logs

The task's `stdout.txt` and `stderr.txt` contain all output of a job, including output that never reaches Application Insights, such as crashes during startup.

- While the job runs, and shortly after: in the Batch account under **Jobs → job → task**.
- After completion: in the environment's storage account, container `nrw-data-cache`, under `task-logs/<hazard>/<job-id>/`. These are kept for 90 days.

## Getting data for local debugging

GloFAS data of deployed runs is stored in the `nrw-data-cache` container of the environment's storage account (see [blob storage retention](README.md#blob-storage-retention)). To rerun a deployed run locally:

1. Download the files, e.g. the country-split data of MWI for 22 Aug 2026 from test. Run this from `data/`, so the files end up in `DATA_CACHE_DIR` (`./data/`). This needs `Storage Blob Data Reader` on the storage account; you can also download the files in the Azure Portal.

   ```bash
   az storage blob download-batch \
     --account-name nrwbatchtest \
     --source nrw-data-cache \
     --pattern "glofas/country_split/20260822/*MWI*" \
     --destination data \
     --auth-mode login
   ```

2. Run the pipeline on that data, from `data/`:

   ```bash
   uv run pipeline --config pipelines/infra/configs/floods.yaml \
     --country MWI \
     --local-data country \
     --local-data-date 20260822
   ```

See [using local data for debugging](../README.md#using-local-data-for-debugging) for the `--local-data` options.

## Alert emails

Each Batch account has a metric alert that fires when one or more tasks fail (`TaskFailEvent` > 0 in a 5-minute window) and emails the team. The test alert also covers staging, as they share a Batch account.

The email only says that a task failed, not why: check the logs above. The alert resolves itself after the next 5-minute window, so it can fire again on the next failure. The alert rules are defined in `NRW-infra`.

## Common problems

| Symptom                                                                                          | Cause and fix                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No job was submitted at the scheduled time                                                       | Check the scheduler's logs in Application Insights (role name = Function App name) and the Function App's **Environment variables**: every Key Vault reference must show as resolved. After rotating a secret, restart the Function App. |
| Task fails immediately with an image pull error                                                  | The image `pipelines:<IBF_ENVIRONMENT>` does not exist in `nrwdockerregistry`. Run the `publish_<env>_pipeline_docker_image` workflow.                                                                                                   |
| Job stays queued; no node starts                                                                 | Check the pool's resize errors. `AllocationFailed` with "subnet has delegation" means the pool subnet (`BatchPools-<env>`) has a subnet delegation, which must be removed in `NRW-infra`.                                                |
| Task ends with exit code 137                                                                     | The pipeline ran out of memory on the node.                                                                                                                                                                                              |
| Task is terminated after 10 hours                                                                | The task hit its maximum run time (`TASK_MAX_WALL_CLOCK_TIME` in [batch_client.py](function/batch_client.py)).                                                                                                                           |
| Manual run script fails with `App setting '...' not found on Function App` or a permission error | Check the [prerequisites](#prerequisites) for the target environment.                                                                                                                                                                    |
