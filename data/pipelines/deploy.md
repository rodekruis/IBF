# Pipeline cloud deployment plan

> Work-in-progress plan for moving NRW Python pipeline jobs from local/scheduled runs to Azure Batch.
> Last updated: 2026-08-20

## Overview

Run the existing [data/Dockerfile](../../Dockerfile) based pipeline as container tasks on Azure Batch.
One job is created per hazard per day. The job downloads shared data (i.e. for flood hazard job, GloFAS global data is downloaded and split by country), runs the forecast pipeline for each target country, and sends results to the NRW backend API.

## Deployment steps and scripts

All files live under `data/deploy/`.

### One time setup

| Group          | Job / script                                                     | Purpose                                                                                |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| One time setup | `set-secrets.sh`                                                 | Store pipeline secrets in Key Vault                                                    |
| One time setup | Create `nrw-batch-scheduler` UAMI + grant its roles (manual CLI) | Dedicated Function identity + `Key Vault Secrets User` and `Azure Batch Job Submitter` |
| One time setup | `apply-lifecycle.sh` (`blob-lifecycle-policy.json`)              | Apply Blob Storage retention policy                                                    |
| One time setup | `create-pool.sh` (`pool.json`)                                   | Create/recreate the Batch pool                                                         |

These run once on first setup (and only again on rotation/policy changes).

- **`set-secrets.sh`** — Runs `az keyvault secret set` for `ibf-pipeline-api-key`, `glofas-ftp-user`, and `glofas-ftp-password` on the `nrw-batch-poc` vault. Reads values from the operator's shell, never hard-codes them. Rerun on secret rotation.
- **Create the scheduler identity and grant its roles (completed 2026-08-14)** — The Function App runs as a **dedicated, unrestricted** user-assigned managed identity `nrw-batch-scheduler`. The Batch pool identity `nrw-batch-poc` **cannot** be reused for the Function App: it is a restricted identity (`IdentityAssignmentRestrictions` limit it to `Microsoft.Batch/batchAccounts` providers), so binding it to a `Microsoft.Web/sites` resource fails with `FailedIdentityOperation`. Creating the identity needs only Contributor; the two role grants need a subscription **Owner** or **User Access Administrator** (Contributor lacks `Microsoft.Authorization/roleAssignments/write`). The identity needs `Key Vault Secrets User` on the vault (to resolve the Key Vault app-setting references) and `Azure Batch Job Submitter` on the Batch account (to create jobs over Entra ID; the account is AAD-only, shared-key auth is disabled). Run once (idempotent):

  ```bash
  # Contributor can create the identity:
  az identity create --name nrw-batch-scheduler --resource-group nrw-batch-poc

  IDENTITY_PRINCIPAL_ID=$(az identity show --name nrw-batch-scheduler --resource-group nrw-batch-poc --query principalId -o tsv)
  KEY_VAULT_ID=$(az keyvault show --name nrw-batch-poc --resource-group nrw-batch-poc --query id -o tsv)
  BATCH_ACCOUNT_ID=$(az batch account show --name nrwbatchpoc --resource-group nrw-batch-poc --query id -o tsv)

  # These two grants require Owner / User Access Administrator:
  az role assignment create \
    --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Key Vault Secrets User" \
    --scope "$KEY_VAULT_ID"
  az role assignment create \
    --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Azure Batch Job Submitter" \
    --scope "$BATCH_ACCOUNT_ID"
  ```

  The `nrw-batch-scheduler` identity was created 2026-08-14 (principal ID `e79c919c-e2b5-4679-9b76-5a047b2cf756`, client ID `37aff145-24fe-40f4-9f35-89da732fd296`), and both role grants were applied 2026-08-14 (`Key Vault Secrets User` assignment `f9e3f5fc-518f-4fad-a53b-b58c2ce3252a`; `Azure Batch Job Submitter` assignment `e0fafe6f-c68e-43cd-b45a-30fe0d910d68`). The earlier `Azure Batch Job Submitter` grant on the pool identity `nrw-batch-poc` (`8d14f658-...`) is no longer used by the Function App and can be left in place or removed. With the values resolved, the two grants are:

  ```bash
  az role assignment create \
    --assignee-object-id e79c919c-e2b5-4679-9b76-5a047b2cf756 \
    --assignee-principal-type ServicePrincipal \
    --role "Key Vault Secrets User" \
    --scope "/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.KeyVault/vaults/nrw-batch-poc"
  az role assignment create \
    --assignee-object-id e79c919c-e2b5-4679-9b76-5a047b2cf756 \
    --assignee-principal-type ServicePrincipal \
    --role "Azure Batch Job Submitter" \
    --scope "/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc"
  ```

- **`blob-lifecycle-policy.json` + `apply-lifecycle.sh`** — Blob lifecycle rules matching the retention table in [Blob storage retention](#blob-storage-retention); the script applies them with `az storage account management-policy create`. Idempotent — rerun only when the retention rules change.
- **`create-pool.sh` + `pool.json`** — Wraps the three `az` commands documented in [Pool creation with blob mount](#pool-creation-with-blob-mount-completed-2026-08-13) (delete pool, create from `pool.json`, PATCH managed identity). Run once at initial setup; rerun only if the pool must be recreated (e.g. to change the Blob `mountConfiguration`, which can only be set at pool creation time). Recreation is safe only when the pool is autoscaled to 0 nodes with no jobs running.

### Deploy to Azure

| Group           | Job / script                                      | Purpose                                              |
| --------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Deploy to Azure | `build-and-push-image.sh`                         | Build & push the pipeline Docker image to ACR        |
| Deploy to Azure | `deploy.sh` (`main.bicep`, `parameters.dev.json`) | Deploy the Function App + monitoring (Bicep)         |
| Deploy to Azure | `publish-function.sh` (`function/`)               | Deploy the Azure Function code (daily job scheduler) |

These are the steps that get run to deploy and redeploy as the code changes. Run in order.

1. **`build-and-push-image.sh`** — Wraps `az acr login`, `docker build` (context `data/`, from `data/Dockerfile`), and `docker push` to `nrwdockerregistry.azurecr.io/pipelines:latest`. Rerun on every image change. Replaced by CI/CD later.
2. **`main.bicep` + `parameters.dev.json` + `deploy.sh`** — Bicep deploys the Function App (Consumption plan, bound to the dedicated `nrw-batch-scheduler` user-assigned managed identity) and the `TaskFailEvent` Azure Monitor alert (action group emailing `ehill@redcross.nl`). The template creates **no** role assignments — the UAMI's RBAC is granted once during setup — so `deploy.sh` only needs Contributor on the resource group. `deploy.sh` wraps the `az deployment group create` command already shown below, then captures the `functionAppName` output for `publish-function.sh`. Bicep does **not** recreate the Batch account or pool. Rerun on every infra change. **Application Insights and Function/Batch diagnostic settings are intentionally skipped for the prototype** — they are deferred until a log sink (Log Analytics / ADX) is chosen (see [Logging (post-prototype)](#logging-post-prototype)).
3. **`function/` (Python Timer Trigger) + `publish-function.sh`** (implemented 2026-08-20) — The daily scheduler; rerun on every scheduler code change:
   - `function_app.py` — Timer trigger at 12:00 UTC (6-field NCRONTAB `0 0 12 * * *`); loops over the in-code `HAZARD_CONFIGS` list and creates one Batch job per hazard. Only **floods** is scheduled for the prototype; drought is a dummy pipeline and tropicalCyclone is not ready yet.
   - `batch_client.py` — Helper that builds the container task (command `pipeline --config pipelines/infra/configs/<hazard>.yaml`, container image `nrwdockerregistry.azurecr.io/pipelines:latest`, env vars, `maxTaskRetryCount = 0`, 10h `maxWallClockTime`) and submits it to the Batch account. Job termination uses `on_all_tasks_complete = 'terminatejob'` so the pool autoscale scales nodes back to 0. Authenticates to the Batch data plane over Entra ID: `ManagedIdentityCredential(client_id=os.environ["AZURE_CLIENT_ID"])` when deployed (the `AZURE_CLIENT_ID` app setting is set by `main.bicep` to the UAMI client ID), `DefaultAzureCredential` locally. Job IDs are `nrw-<hazard>-<YYYYMMDD>-<HHMM>`.
   - `host.json`, `requirements.txt` (`azure-functions`, `azure-batch`, `azure-identity`, `requests`) — Standard Azure Functions Python v2 project files.
   - `create-local-settings.sh` — Generates the gitignored `function/local.settings.json` for local runs, reading the secret values from `data/.env`.
   - `publish-function.sh` — Publishes the function code to the deployed Function App.

   Local tooling prerequisites (macOS):

   ```bash
   brew tap azure/functions
   brew install azure-functions-core-tools@4
   brew install python@3.11  # matches the deployed runtime
   ```

   **Local testing**: run `./create-local-settings.sh` to generate `function/local.settings.json` from `data/.env`, then `func start` inside `function/` (requires Azurite or a real storage connection for `AzureWebJobsStorage`). Local job submission uses `DefaultAzureCredential` with the operator's `az login` identity, so **that operator needs `Azure Batch Job Submitter` on `nrwbatchpoc`** (the scheduler UAMI's grants do not apply to a human running locally). Grant it once (requires Owner / User Access Administrator):

   ```bash
   az role assignment create \
     --assignee <operator-object-id-or-upn> \
     --role "Azure Batch Job Submitter" \
     --scope "/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc"
   ```

### Helper jobs

| Group       | Job / script   | Purpose                                                   |
| ----------- | -------------- | --------------------------------------------------------- |
| Helper jobs | `rerun-job.sh` | Manually rerun a Batch job (reads secrets from Key Vault) |

Run on demand, not part of the normal deploy flow.

- **`rerun-job.sh`** — Reads the three secrets from Key Vault and submits a single Batch job for a chosen hazard/config, so manual reruns don't require pasting secret values by hand. Optional for MVP; a Function-based rerun with parameter overrides will replace it later.

  Notes for when it is built:
  - **Auth parity**: like the Function, it must authenticate to Batch over Entra ID (the account is AAD-only — no shared key). It runs as the operator's own `az login` identity, so **that operator needs `Azure Batch Job Submitter` on `nrwbatchpoc` and `Key Vault Secrets User` on `nrw-batch-poc`** (the scheduler UAMI's grants do not apply to a human running the CLI).
  - **Secret handling**: read the secrets with `az keyvault secret show` and pass them as task environment variables; never echo them to stdout or commit them.
  - **Reuse**: prefer sharing the job/task construction with `function/batch_client.py` (e.g. import it or mirror its container-task definition) so reruns stay identical to scheduled runs.

## Compute

- **Azure Batch** account with a container-enabled pool.
- Treat the Batch account as a **permanent resource** rather than deploying it on-the-fly, to avoid single points of failure. (See following section for more details on batch account set up).
- Initial VM SKU: `Standard_E2as_v4` (16 GB RAM, 32 GB local temp storage, memory-optimized). Two nodes each running one job was cheaper than one larger node running all jobs concurrently.
- Pool autoscales from **0 to 2 nodes** to keep costs low when idle; the pool nodes represent the majority of cost. Set max to 2 nodes. Once the job queue is empty, the VM is deleted so no compute cost remains.
- Task `maxWallClockTime`: **10 hours**. If a task exceeds this, Batch kills it and marks it failed. Evaluate this timeout once we have real-world run duration data.
- Docker image is pulled from **Azure Container Registry (ACR)**. Use the existing NRW ACR (the same one used for the featureserv image).
  - Registry resource group: `NRW`
  - Registry name: `nrwdockerregistry`
  - Login server: `nrwdockerregistry.azurecr.io`
  - Build context: repo root `/data`
  - Image: `nrwdockerregistry.azurecr.io/pipelines:latest`
  - ACR integration: the pool is already attached to `nrwdockerregistry` and configured to prefetch `nrwdockerregistry.azurecr.io/pipelines:latest` so tasks start quickly
- Integrate the pool into the NRW Azure VNETs so tasks can reach the NRW backend API and other Azure resources privately (exact connectivity — private endpoint, VNet peering, service endpoint, or public routing — depends on how the API is deployed). The pool subnet is `batch` in `nrw-vnet-test` (`NRW` resource group, `westeurope`), delegated to `Microsoft.Batch/batchAccounts` and secured by NSG `nrw-NSG-test`.
- Provision the pool with a **user-assigned managed identity** (`nrw-batch-poc`) attached to every node; jobs use it to authenticate to Azure resources such as Storage and Key Vault. The pipeline itself only communicates with the NRW backend API, so no direct database access from the nodes is needed.
- Use the **Ubuntu HPC 24.04** image (`publisher: microsoft-dsvm`, `offer: ubuntu-hpc`, `sku: 2404`, `version: latest`). The container configuration cannot be added to an existing pool; the pool must be created with container support enabled from the start.

### Azure Batch account setup (manual portal setup — current state)

The target subscription is the **AA subscription**. The following resources have already been provisioned in Azure:

| Resource                       | Name / Value                                                                | Notes                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource group                 | `nrw-batch-poc`                                                             | Holds all Batch-related resources                                                                                                                                     |
| Batch account                  | `nrwbatchpoc`                                                               | Created with Key Vault-based node pool credential management                                                                                                          |
| Key Vault                      | `nrw-batch-poc`                                                             | RBAC permission model; VM/ARM & ADE enabled; holds pipeline secrets                                                                                                   |
| Storage account                | `nrwbatchpoc`                                                               | General-purpose V2; Blob container `nrw-data-cache` mounted as `DATA_CACHE_DIR`                                                                                       |
| User-assigned managed identity | `nrw-batch-poc`                                                             | Assigned to pool nodes                                                                                                                                                |
| VNet / subnet                  | `nrw-vnet-test` / `batch`                                                   | Subnet `batch` in `nrw-vnet-test` (`NRW` RG, `westeurope`) delegated to `Microsoft.Batch/batchAccounts`. NSG: `nrw-NSG-test`. (`nrw-vnet-prod` also exists in `NRW`.) |
| Batch pool ID                  | `nrwbatchpoc`                                                               | Single pool in the Batch account                                                                                                                                      |
| ACR                            | `nrwdockerregistry` (`NRW` RG, login server `nrwdockerregistry.azurecr.io`) | Reuse the ACR that hosts the featureserv image                                                                                                                        |

Provisioning a Batch account through the Azure Portal has a few non-obvious requirements:

1. **Do not create a new managed subscription for the node pool resources.** The default GUI option attempts to create a new managed subscription, which will likely fail due to the NLRC subscription-creation policy. Switch this to use the dedicated **Azure Key Vault** (`nrw-batch-poc`) instead.
2. **Register the `Microsoft.Batch` resource provider** in the target subscription before provisioning. ✅ Already registered.
3. **Assign the Azure Batch Orchestration role on the AA subscription** to the `Microsoft Azure Batch` service principal created by resource registration.
4. **Assign `Key Vault Secrets Officer`** on `nrw-batch-poc` to the same `Microsoft Azure Batch` service principal, so the Batch account can use the vault for node pool credential management.
5. **Assign `Key Vault Administrator`** on `nrw-batch-poc` to the ops/admin group so the team can create and rotate secrets.
6. **Assign `Key Vault Secrets User`** on `nrw-batch-poc` and **`Storage Blob Data Contributor`** on the Blob container to the `nrw-batch-poc` user-assigned managed identity.

#### Autoscale formula

This is a code sample from Klaas.
The pool uses the following autoscale formula (max 2 nodes, scale down after task completion):

```text
// In this example, the pool size is adjusted based on the number of tasks in the queue.
// Note that both comments and line breaks are acceptable in formula strings.

// Get pending tasks for the past 15 minutes.
$samples = $ActiveTasks.GetSamplePercent(TimeInterval_Minute * 15);
// If we have fewer than 70 percent data points, use the last sample point,
// otherwise use the maximum of last sample point and the history average.
$tasks = $samples < 70 ? max(0, $ActiveTasks.GetSample(1)) :
    max($ActiveTasks.GetSample(1), avg($ActiveTasks.GetSample(TimeInterval_Minute * 15)));
// If number of pending tasks is not 0, set targetVM to pending tasks, otherwise 0.
$targetVMs = $tasks > 0 ? $tasks : 0;
// The pool size is capped at 2.
cappedPoolSize = 2;
$TargetDedicatedNodes = max(0, min($targetVMs, cappedPoolSize));
// Keep nodes active only until tasks finish.
$NodeDeallocationOption = taskcompletion;
```

## Job scheduling

- **Daily schedule**: A **Python** Azure Function (Timer Trigger, **Consumption plan**) fires daily at **12:00 UTC** and creates one Batch job per hazard. Two nodes each running one job was cheaper than one larger node running all jobs concurrently, so the plan is to run one job per node. This may be changed later.
- **Hazard configs**: 3 planned for the prototype (drought, floods, cyclones). More will be added over time. Drought is currently a dummy pipeline — its real data source will be handled later.
- **Task retries**: Retrying is handled inside the pipeline Python code (e.g. GloFAS FTP downloads and forecast-date resolution already retry with backoff). The Azure Function creating the Batch job should set `maxTaskRetryCount = 0`, so failures surface immediately and are not hidden by Batch-level retries.
- **Job naming**: Jobs are named with a deterministic prefix plus the hazard and a timestamp including day, hour, and minute (e.g. `nrw-floods-20260805-1203`). Because the backend already deduplicates submitted forecasts, rerunning the same day is safe from a data standpoint, but the Batch job ID must still be unique within the account.
- **Manual reruns**: Azure CLI or Azure Portal → Batch account → Jobs → Add.
  - No custom React page for MVP.
  - A rerun via the Azure Function with parameter overrides (e.g. `countries`) will be added later. For now, rerunning through the CLI/portal requires manually supplying all task environment variables, including secret values such as `IBF_PIPELINE_API_KEY`, `GLOFAS_FTP_USER`, and `GLOFAS_FTP_PASSWORD`, or using another method such as a script that reads them from Key Vault.
- The Azure Function is a **Bicep-managed Function App** deployed from this repo (code will live under `data/deploy/`).
- The Azure Function runs under a managed identity and can fetch secrets (e.g., GloFAS FTP credentials) from **Azure Key Vault**, injecting them as environment variables into task containers.
- **Container task command** — The Batch task command mirrors local invocation, e.g.: `pipeline --config pipelines/infra/configs/floods.yaml`. The `pipeline` entry point is declared in `pyproject.toml`; the YAML config under `pipelines/infra/configs/` selects the hazard and countries. The Function will schedule one job per config/hazard.

## Storage

- **Azure Blob Storage**: GloFAS global downloads (~600 MB per file, ~30 GB total for a daily set of ~50 files), country split outputs, debug/dev data, and large result payloads. Only one GloFAS file is loaded at a time, so peak working storage is ~600 MB–1 GB. All downloaded GloFAS files are written to Blob Storage.

### Blob storage retention

The pipeline already writes to subdirectories under `DATA_CACHE_DIR` as defined in `pipelines/infra/utils/storage_helpers.py`. Configure Azure Blob lifecycle management policies per prefix:

| Blob prefix                                   | Content                                     | Retention                  |
| --------------------------------------------- | ------------------------------------------- | -------------------------- |
| `glofas/raw/{forecast_date}/`                 | Global GloFAS downloads                     | 30 days                    |
| `glofas/country_split/{forecast_date}/`       | Country-split GloFAS data (for development) | Indefinite (revisit later) |
| `glofas/country_split_alert/{forecast_date}/` | Country-split data that triggered alerts    | Indefinite                 |

NOAA data is not yet integrated into the pipeline; retention rules for NOAA will be added when that data source is introduced.

## Out of scope for first prototype

### Evaluate after first prototype is running

- **Logging and retention**: Validate what Azure Batch streams to Azure Monitor, decide on Blob Storage / Application Insights retention for raw logfiles, and finalize an aggregate log analysis strategy.
- **Test Batch account**: Set up a separate Batch account for dry-run validation of new pipeline definitions before production deployment. Minimize costs by using a smaller VM size (e.g., A-series) for tests that do not require the full 12 GB memory footprint.
- **Managed identity database auth**: Not applicable for the Batch pipeline — all database access goes through the NRW backend API. Revisit only if a future pipeline component needs direct database connectivity.
- **CI/CD image builds**: Set up a GitHub Actions workflow to build and push the Docker image to ACR on merge to main (tag by commit SHA or date). Until then, the image is built and pushed locally.
- Confirm Azure Batch quota and VM family limits in target subscription for `Standard_E2as_v4`.
- Measure actual peak memory during a full run to validate the `Standard_E2as_v4` choice.
- **ADX cluster**: Set up ADX for centralized logging (deferred from prototype due to ~$150/month minimum cost).
- We need to set up data input for a test env for this so we can have predictable tests. This may be on the country level, or maybe we need to cache an alert generating global glofas file somewhere (such as in a new folder in blob storage).

### Handle after MVP or as need arises

- **Data caching**: There are two types of data we could cache: PostGis DB data (admin areas, roads, buildings) and static data (population source image). Consider caching this later. It would need resources set up in azure, and code change in the pipelines. For now, it pulls from the backend directly.
- **Logging**: Consider structured JSON logging (rather than tagged strings) if dashboards and alerts need richer filtering.
- **Production VNet**: `nrw-vnet-prod` exists in the `NRW` resource group alongside `nrw-vnet-test`. Production deployment will use `nrw-vnet-prod`; for the prototype only `nrw-vnet-test` is used.
- **Additional hazard pipelines**: Drought real data source, cyclones, and other hazards beyond the initial 3.
- **NOAA data source**: Not yet integrated. Add retention policies and env vars when introduced.
- **Additional environments**: Only `test` (`IBF_ENVIRONMENT=test`) is used for the prototype. Production and other environments will be configured after the prototype.

## Logging (post-prototype)

ADX is deferred until after the prototype due to its minimum cost (~$150/month). For the prototype, rely on Azure Batch's built-in stdout/stderr logs (viewable in Portal and Batch Explorer).

Target state after prototype:

- **Azure Data Explorer (ADX)** is the primary log store.
- Azure Batch diagnostics are routed via Event Hub into ADX.
- Pipeline code emits `print()` lines with a leading tag to be easily found in ADX.
- Retention: If possible, we want a long retention policy, 180 days if possible, but 90 days might be fine. 30 is too short. The logs will not contain PII.

## Failure visibility

- **Email notifications**: Azure Monitor alert rule on Batch `TaskFailEvent`. For the prototype, send to `ehill@redcross.nl`. After the prototype, switch to `ibf-devops@redcross.nl`.
- **Azure Portal**: Batch account → Jobs → Tasks for status and logs.
- **Azure Batch Explorer**: free Microsoft desktop app for richer run/task inspection.

## Infrastructure as code

- Use **Bicep** templates stored under `data/deploy/` in this repo. Bicep deploys the Function App, diagnostics, and alerts against the already-provisioned Batch account and pool — it does not recreate them.
- Deploy to the existing `nrw-batch-poc` resource group with Azure CLI:

```bash
az deployment group create \
  --resource-group nrw-batch-poc \
  --template-file data/deploy/main.bicep \
  --parameters data/deploy/parameters.dev.json
```

### Pool creation with blob mount (completed 2026-08-13)

The pool `nrwbatchpoc` has been created with the blob mount configured. The pool definition is in [`data/deploy/pool.json`](../deploy/pool.json), and the creation steps are wrapped by [`data/deploy/create-pool.sh`](../deploy/create-pool.sh) (a one-time-setup script). The `mountConfiguration` property can only be set at pool creation time, so if the pool ever needs to be recreated (e.g. to change the mount), rerun the script:

```bash
./data/deploy/create-pool.sh
```

The script runs the three `az` commands below in order. Recreation is safe only when the pool is autoscaled to 0 nodes with no jobs running.

```bash
# 1. Delete the existing pool (safe when autoscaled to 0 nodes / no jobs running)
az batch pool delete --pool-id nrwbatchpoc \
  --account-name nrwbatchpoc \
  --account-endpoint nrwbatchpoc.westeurope.batch.azure.com --yes

# 2. Recreate the pool from the JSON definition (includes mount, autoscale, VNet, ACR, container config)
az batch pool create --json-file data/deploy/pool.json \
  --account-name nrwbatchpoc \
  --account-endpoint nrwbatchpoc.westeurope.batch.azure.com

# 3. Assign the managed identity via the management API (not supported in the data-plane JSON)
az rest --method PATCH \
  --url "https://management.azure.com/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc/pools/nrwbatchpoc?api-version=2024-07-01" \
  --body '{"identity":{"type":"UserAssigned","userAssignedIdentities":{"/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourcegroups/nrw-batch-poc/providers/Microsoft.ManagedIdentity/userAssignedIdentities/nrw-batch-poc":{}}}}'
```

### Network requirements

The pool is in subnet `batch` of `nrw-vnet-test` (`NRW` RG). Nodes must reach:

- **NRW API** — over a private endpoint, VNet peering, or public routing. If the API uses a Private Endpoint, link the corresponding **Private DNS Zone** (e.g. `privatelink.azurewebsites.net`) to `nrw-vnet-test` so DNS resolves correctly.
- **ACR** — `nrwdockerregistry.azurecr.io`. If the registry uses a private endpoint, link its DNS zone to `nrw-vnet-test`; otherwise the subnet must allow outbound HTTPS (443) to the registry's public endpoint. The UAMI `nrw-batch-poc` is used for image pull authentication.
- **Blob Storage** — `nrwbatchpoc.blob.core.windows.net`. The Blob mount works over HTTPS (443); add a service endpoint or private endpoint for `Microsoft.Storage` on the `batch` subnet if public access is restricted.
- **GloFAS FTP** — `aux.ecmwf.int` on port 21 + passive high ports (1024–65535).

#### NSG / firewall rules

The subnet's NSG is `nrw-NSG-test`. It currently has no custom outbound rules, so Azure defaults allow the required outbound traffic. If the NSG is later locked down, explicitly allow:

- HTTPS (443) to the ACR (`nrwdockerregistry.azurecr.io`) and Blob Storage (`nrwbatchpoc.blob.core.windows.net`).
- FTP control (port 21) and passive data ports (1024–65535) to `aux.ecmwf.int`.

## Data Pipeline Project Setup

The Python pipeline container requires no code changes to run in Azure Batch.

### Image build and deployment

1. **Build & push the Docker image** — Build from `data/Dockerfile` (context: repo root `/data`) and push to ACR. For the initial prototype, the image is built and pushed locally; CI/CD automation comes later.
   - The YAML configs (`pipelines/infra/configs/*.yaml`) are baked into the image, so adding a country or changing data sources requires a new build+push.

## Pipeline environment variables

The following environment variables must be set as task environment variables when the Azure Function creates the Batch task:

| Variable               | Value                                                                       | How to set                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IBF_ENVIRONMENT`      | `test` (prototype)                                                          | Must match one of the values accepted by `pipelines.infra.environment.load_environment_settings()`. Use `test` for the prototype; other environments after.  |
| `IBF_API_URL`          | e.g. `https://<app-name>.azurewebsites.net`                                 | Set to the NRW backend API base URL for the target environment. The `ApiClient` appends `/api/...` paths, so do not include `/api` here.                     |
| `IBF_PIPELINE_API_KEY` | (from Key Vault secret `ibf-pipeline-api-key`)                              | Injected by the Azure Function from Key Vault as a secure environment variable on the Batch task. Required by `ApiClient` for backend authentication.        |
| `GITHUB_DATA_BASE_URL` | `https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main` | Hard-coded URL used for seed data (e.g. flood extents). Required by the floods config even for live runs because `flood_extents_seed_repo` is always loaded. |
| `GLOFAS_FTP_HOST`      | `aux.ecmwf.int`                                                             | Hard-coded ECMWF GloFAS FTP host.                                                                                                                            |
| `GLOFAS_FTP_USER`      | (from Key Vault secret `glofas-ftp-user`)                                   | Injected by the Azure Function from Key Vault as a secure environment variable on the Batch task.                                                            |
| `GLOFAS_FTP_PASSWORD`  | (from Key Vault secret `glofas-ftp-password`)                               | Injected by the Azure Function from Key Vault as a secure environment variable on the Batch task.                                                            |
| `DATA_CACHE_DIR`       | `/mnt/batch/tasks/fsmounts/nrw-data-cache`                                  | Must match the Blob Storage mount path configured on the Batch pool.                                                                                         |

`SEED_DATA_REPO_ROOT` is not needed in production — it is only used for local dev/test seed data loading. `GITHUB_DATA_BASE_URL` (which points to the same seed data over HTTPS) is still required.

## Key Vault secrets

All secrets used by the pipeline and scheduling infrastructure are stored in a single Azure Key Vault instance. The scheduler Function App runs as the dedicated `nrw-batch-scheduler` user-assigned managed identity, which has the `Key Vault Secrets User` role on this vault, allowing the Function host to resolve the Key Vault references in its app settings and inject the secrets as Batch task environment variables at job creation time.

### Required secrets

| Secret name            | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `ibf-pipeline-api-key` | API key for the NRW backend (`IBF_PIPELINE_API_KEY`) |
| `glofas-ftp-user`      | ECMWF GloFAS FTP username (`GLOFAS_FTP_USER`)        |
| `glofas-ftp-password`  | ECMWF GloFAS FTP password (`GLOFAS_FTP_PASSWORD`)    |

### Key Vault configuration notes

- Use the **RBAC permission model** (not access policies) for the vault so permissions are managed via Azure AD role assignments.
- Grant `Key Vault Secrets User` to the dedicated `nrw-batch-scheduler` user-assigned managed identity used by the scheduler Function App, and to the `nrw-batch-poc` identity used by the Batch pool nodes.
- Grant `Key Vault Secrets Officer` to the ops/admin group for secret rotation.
- Enable **soft delete** and **purge protection** (defaults on new vaults) to prevent accidental permanent loss.
- Secrets should follow kebab-case naming (e.g., `ibf-pipeline-api-key`).
- Rotate `ibf-pipeline-api-key` by updating both the Key Vault secret and the NRW backend's accepted key list. The next scheduled job picks up the new value automatically.
- The Key Vault referenced during Batch account creation (for node pool credential management) can be the same vault or a separate one depending on access boundary preferences.
