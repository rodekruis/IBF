# Pipelines deploy guide

This is the user-facing guide to help with running jobs, debugging, etc.
See deploy.md for the full details on the deployment, including post-MVP plans.
See deploy_requirements.md for the initial requirements of the work.

## Debugging

### From App Insights

- In the portal, go to the [nrw-batch-scheduler App Insights → Logs](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Insights/components/nrw-batch-scheduler/logs)

Example query:

```kusto
union traces, exceptions
| where timestamp between (datetime(2026-08-23T14:00:51Z) .. datetime(2026-08-23T16:16:20Z))
| order by timestamp asc
```

### From the batch account, while the job is running or shortly after it completed

- You can see errors from before the jobs starts in Azure -> nrwbatchpoc (batch account) -> Pools
- You can see logs in Azure Batch's built-in stdout/stderr files. Go to [Azure -> nrwbatchpoc (batch account)](https://portal.azure.com/#@rodekruis.onmicrosoft.com/resource/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc/accountOverview) -> Jobs -> select job -> select task -> stderr.txt

## Email error notifications

When an alert email comes in, it just says what failed, not why. You still need to look into the Application Insights logs for more information.

These auto resolve, but this is just the notification turning itself off so it can refire if the next run fails. If you want to turn off the auto-resolve state, you can do so in the main.bicep file (`autoMitigate: false` on the `TaskFailEvent` alert — but then the alert only emails again after someone manually resolves it in Azure Monitor -> Alerts).
