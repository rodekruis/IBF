# Pipelines deployment

This document describes how to deploy the Python pipelines in `data/` to Azure as
scheduled jobs, with run logs and email alerts on failure.

## Architecture

The pipeline package is built into a Docker image and run as **Azure Container Apps Jobs**
on a cron schedule. Each job is a separate invocation of the same image with different
CLI arguments (one job per hazard config file).

| Component                | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| Azure Container Registry | Stores the built `nrw-pipelines` image                |
| Container Apps Env       | Runtime environment for the jobs                      |
| Container Apps Job (x2)  | One scheduled job per hazard (drought, floods)        |
| Log Analytics workspace  | Receives stdout/stderr and system logs from every run |
| Action Group             | Sends email (and later Teams) notifications           |
| Scheduled-query alert    | Fires the Action Group when a job execution fails     |

Schedules (UTC, staggered to avoid overlap):

| Job                    | Cron         | Time  |
| ---------------------- | ------------ | ----- |
| `nrw-pipeline-drought` | `0 6 * * *`  | 06:00 |
| `nrw-pipeline-floods`  | `15 6 * * *` | 06:15 |

Tweak these in [data/deploy/config.test.env](data/deploy/config.test.env).

## Azure resources

The deploy script creates everything below in the resource group
`nrw-pipelines-test-rg` (configurable):

1. **Resource group** — `nrw-pipelines-test-rg`
2. **Log Analytics workspace** — `nrw-pipelines-test-logs`
3. **Azure Container Registry** (Basic SKU) — `nrwpipelinestestacr`
4. **Container Apps environment** — `nrw-pipelines-test-env`, wired to the workspace
5. **Container Apps Jobs** — `nrw-pipeline-drought`, `nrw-pipeline-floods`
6. **Action Group** — `nrw-pipelines-test-ag` (email: `ehill@redcross.nl`)
7. **Scheduled-query alert** — `nrw-pipelines-test-failures`

Each job runs with a **system-assigned managed identity** and is granted the
`AcrPull` role on the registry, so it pulls images without admin credentials.

Job secrets (DB keys, API keys, ...) are taken from your local `.env` and stored
as Container Apps **job secrets**. The container receives them as environment
variables with their original names.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az --version` ≥ 2.60)
- An Azure subscription you can `az login` into
- A populated `data/.env` (copy from `data/.env.example`)

```bash
cd data
cp .env.example .env
# edit .env with real secrets
az login
az account set --subscription "<your-subscription-id>"
```

## Deploy (local, test environment)

```bash
cd data
./deploy/deploy.sh
```

The script is idempotent — re-run it to push a new image, update secrets, or
change a cron schedule.

What it does, in order:

1. Registers required Azure resource providers.
2. Creates / verifies the resource group, Log Analytics workspace, ACR, and
   Container Apps environment.
3. Builds the image in ACR from `data/Dockerfile` and tags it `:latest`.
4. Parses `data/.env` into a list of Container Apps secrets and env-var refs.
5. Creates (or updates) the two scheduled jobs with the right CLI args:
   - drought → `pipeline --config pipelines/infra/configs/drought.yaml --run-target DEBUG`
   - floods → `pipeline --config pipelines/infra/configs/floods.yaml  --run-target DEBUG`
6. Creates / updates the Action Group with the email recipient.
7. Creates / updates the failure alert rule querying the workspace.

## Grant ACR pull permissions to each job (one-time, per job)

Each Container Apps Job is created with its own system-assigned managed
identity. That identity needs the `AcrPull` role on the registry before the job
can pull its image. `deploy.sh` attempts this automatically but will silently
skip it if your account lacks `Microsoft.Authorization/roleAssignments/write`
on the resource group — in that case an admin (Owner or User Access
Administrator) needs to run the commands below once per job.

Find each job's principal ID:

```bash
az containerapp job show -g nrw-pipelines-test-rg -n nrw-pipeline-drought \
  --query identity.principalId -o tsv
az containerapp job show -g nrw-pipelines-test-rg -n nrw-pipeline-floods \
  --query identity.principalId -o tsv
```

Then have the admin assign the role to each principal. The subscription ID
below is the 510 subscription and shouldn't change:

```bash
az role assignment create \
  --assignee <drought-principal-id> \
  --scope /subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-pipelines-test-rg/providers/Microsoft.ContainerRegistry/registries/nrwpipelinestestacr \
  --role AcrPull

az role assignment create \
  --assignee <floods-principal-id> \
  --scope /subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-pipelines-test-rg/providers/Microsoft.ContainerRegistry/registries/nrwpipelinestestacr \
  --role AcrPull
```

Verify both principal IDs appear in the registry's `AcrPull` role assignments:

```bash
az role assignment list \
  --scope $(az acr show -n nrwpipelinestestacr --query id -o tsv) \
  --query "[?roleDefinitionName=='AcrPull'].principalId" -o tsv
```

Role assignments are persistent — you only need to redo this if a job is
recreated (which gives it a new managed identity).

## Trigger a job manually

Useful for smoke-testing after a deploy:

```bash
az containerapp job start -g nrw-pipelines-test-rg -n nrw-pipeline-drought
az containerapp job start -g nrw-pipelines-test-rg -n nrw-pipeline-floods
```

List recent executions:

```bash
az containerapp job execution list \
  -g nrw-pipelines-test-rg -n nrw-pipeline-drought \
  --query "[].{name:name, status:properties.status, startTime:properties.startTime}" \
  -o table
```

## Run logs

Container stdout/stderr lands in Log Analytics in the
`ContainerAppConsoleLogs_CL` table. Job lifecycle events (started / succeeded /
failed) land in `ContainerAppSystemLogs_CL`.

Examples (Portal → Log Analytics workspace → Logs):

```kql
// All recent console output for the drought job
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "nrw-pipeline-drought"
| order by TimeGenerated desc
| take 200

// Failed executions in the last 24h, across all pipelines
ContainerAppSystemLogs_CL
| where ContainerAppName_s startswith "nrw-pipeline-"
| where Reason_s in ("ExecutionFailed","JobFailed","RetriesExhausted","BackOffLimitExceeded")
| order by TimeGenerated desc
```

The Container Apps Job blade in the Portal also has a built-in **Execution
history** view, which is the easiest dashboard for day-to-day monitoring.

## Alerts

### Email (already wired)

The Action Group `nrw-pipelines-test-ag` sends an email to
`ehill@redcross.nl` whenever the scheduled-query alert fires. The query checks
every 15 minutes over a 30-minute window for failed executions of any job whose
name starts with `nrw-pipeline-`.

To change recipients later:

```bash
az monitor action-group update \
  -g nrw-pipelines-test-rg -n nrw-pipelines-test-ag \
  --add-action email someone someone@example.org
```

### Teams (do this later)

The Action Group supports Teams in two ways. Recommended path with Logic Apps,
because the legacy "Office 365 connector" webhook is being retired by Microsoft.

1. In Teams, create / choose a channel for alerts.
2. In the Azure Portal, create a **Logic App (Consumption)**:
   - Trigger: **When a HTTP request is received**
   - Action: **Microsoft Teams — Post a message in a chat or channel** (sign in
     with an account that has access to the target channel).
   - Map fields from the incoming alert payload to the Teams message body. Azure
     Monitor common alert schema is documented here:
     <https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-common-schema>.
   - Save and copy the generated HTTP POST URL.
3. Attach the Logic App to the Action Group:

   ```bash
   az monitor action-group update \
     -g nrw-pipelines-test-rg -n nrw-pipelines-test-ag \
     --add-action logicapp nrw-teams \
       <logic-app-resource-id> \
       <logic-app-trigger-url> \
       UseCommonAlertSchema=true
   ```

   You can also wire this up entirely in the Portal:
   _Action Group → Actions → Add action → Logic App_.

4. Trigger a deliberate failure (e.g. break a secret, run the job) to confirm
   the Teams card arrives.

## Updating after code changes

A re-run of `./deploy/deploy.sh` will:

- rebuild and re-push the image as `:latest`,
- update the jobs to use the new image,
- re-sync secrets from `.env`,
- re-apply cron / schedule changes from `config.test.env`.

If you only changed `.env`, the same command still works — the build step is
fast when nothing in the image changed.

## GitHub Actions (future)

When ready to move this to CI, the same `deploy/deploy.sh` can run from a
workflow that:

1. Authenticates with `azure/login@v2` using an OIDC federated credential
   (preferred) or a service principal secret.
2. Restores `data/.env` from GitHub Actions secrets (one secret per key, or a
   single `ENV_FILE` secret written to disk).
3. Runs `cd data && ./deploy/deploy.sh`.

A starter workflow (not committed yet) would look like:

```yaml
name: Deploy pipelines (test)
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'data/**'
      - '.github/workflows/deploy-pipelines.yml'

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - name: Write .env from secret
        run: echo "${{ secrets.PIPELINES_ENV_FILE }}" > data/.env
      - name: Deploy
        run: ./deploy/deploy.sh
        working-directory: data
```

## Tear-down

To remove everything in the test environment:

```bash
az group delete -n nrw-pipelines-test-rg --yes --no-wait
```
