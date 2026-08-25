# Pipelines deploy guide

This is the user-facing guide to help with running jobs, debugging, etc.
See deploy.md for the full details on the deployment, including post-MVP plans.
See deploy_requirements.md for the initial requirements of the work.

## Getting files for local debugging

You can get Glofas data from Azure for debugging local runs. Here are examples with Glofas data after it has been split into individual countries.

From the azure portal:
[Azure → nrwbatchpoc storage account → Containers → nrw-data-cache → browse into glofas/country_split/.](https://portal.azure.com/#view/Microsoft_Azure_Storage/ContainerMenuBlade/~/overview/storageAccountId/%2Fsubscriptions%2F57b0d17a-5429-4dbb-8366-35c928e3ed94%2FresourceGroups%2Fnrw-batch-poc%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2Fnrwbatchpoc/path/nrw-data-cache/etag/%220x8DEF2D384D83E43%22/defaultId//publicAccessVal/None)
You can select multiple, click '...' -> 'download' for one file, and it will download for all of them.

From the command line, after logging in with `az login`, you can download with something like the following command. This fetches all MWI data for Aug 23, 2026. Set the timestamp and country as needed.

```
az storage blob download-batch \
  --account-name nrwbatchpoc \
  --source nrw-data-cache \
  --pattern "glofas/country_split/20260822/*MWI*" \
  --destination data/data \
  --auth-mode key
```

The files should be placed in `{DATA_CACHE_DIR}/glofas/country_split/{date}/`. The above command would do that automatically if ran from repo root.

To use these, from `./data` run something like this with the correct country and timestamp.

```
uv run pipeline --config pipelines/infra/configs/floods.yaml \
  --country MWI \
  --local-data country \
  --local-data-date 20260822
```

## Getting Logs

### From App Insights

- In the portal, go to the [nrw-batch-scheduler App Insights → Logs](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Insights/components/nrw-batch-scheduler/logs)

You can see live metrics and performance, as well as see logs.

Example query:

```kusto
union traces, exceptions
| where timestamp between (datetime(2026-08-21T14:30Z) .. datetime(2026-08-21T15:45Z))
| where severityLevel >= 2
| order by timestamp asc
```

This component's Logs blade shows only the pipeline's telemetry, so the query above needs no extra filter.

### From the shared nrw-app-law workspace

The logs are also sent to a shared NRW workspace at [nrw-app-law → Logs](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/NRW/providers/Microsoft.OperationalInsights/workspaces/nrw-app-law/logs). Filter by the `cloud_RoleName` to see pipeline logs. You can query here for both NRW backend service logs as well as pipeline logs.

```kusto
union traces, exceptions
| where cloud_RoleName == "nrw-batch-scheduler"
| where timestamp between (datetime(2026-08-21T14:30Z) .. datetime(2026-08-21T15:45Z))
| where severityLevel >= 2
| order by timestamp asc
```

### From the batch account, while the job is running or shortly after it completed

- You can see errors from before the jobs starts in Azure -> nrwbatchpoc (batch account) -> Pools
- You can see logs in Azure Batch's built-in stdout/stderr files. Go to [Azure -> nrwbatchpoc (batch account)](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc/accountOverview) -> Jobs -> select job -> select task -> stderr.txt

## Email error notifications

When an alert email comes in, it just says what failed, not why. You still need to look into the Application Insights logs for more information.

These auto resolve, but this is just the notification turning itself off so it can refire if the next run fails. If you want to turn off the auto-resolve state, you can do so in the main.bicep file (`autoMitigate: false` on the `TaskFailEvent` alert — but then the alert only emails again after someone manually resolves it in Azure Monitor -> Alerts).
