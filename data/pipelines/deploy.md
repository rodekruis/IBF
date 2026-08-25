# Pipeline cloud deployment plan

The general requirements this plan implements are in [deploy_requirements.md](deploy_requirements.md); this document is the practical implementation overview.

## Overview

Run the existing [data/Dockerfile](../../Dockerfile) based pipeline as container tasks on Azure Batch.
One job is created per hazard per day. The job downloads shared data (i.e. for flood hazard job, GloFAS global data is downloaded and split by country), runs the forecast pipeline for each target country, and sends results to the NRW backend API.

## RBAC prerequisites

Every Azure role assignment the deployment depends on is listed here in one place. Sections below reference this table instead of repeating the grant commands. All of these grants require a subscription **Owner** or **User Access Administrator** to apply (plain **Contributor** lacks `Microsoft.Authorization/roleAssignments/write`), and all are idempotent — apply once at setup.

Shared values used in the scopes below:

- Subscription: `57b0d17a-5429-4dbb-8366-35c928e3ed94`
- Key Vault scope: `/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.KeyVault/vaults/nrw-batch-poc`
- Batch account scope: `/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc`

- **`nrw-batch-scheduler`** (Function App UAMI — ServicePrincipal):
  - Role: `Key Vault Secrets User`; Scope: Key Vault `nrw-batch-poc`; Why: resolve the Key Vault app-setting references in the Function App.
  - Role: `Azure Batch Job Submitter`; Scope: Batch account `nrwbatchpoc`; Why: create Batch jobs over Entra ID (account is AAD-only).
- **`nrw-batch-poc`** (pool node UAMI — ServicePrincipal):
  - Role: `Key Vault Secrets User`; Scope: Key Vault `nrw-batch-poc`; Why: pool nodes read secrets from the vault.
  - Role: `Storage Blob Data Contributor`; Scope: Blob container `nrw-data-cache` on storage account `nrwbatchpoc`; Why: Blob mount used as `DATA_CACHE_DIR`.
- **Operator running `func start` / `rerun-job.sh`** (User):
  - Role: `Azure Batch Job Submitter`; Scope: Batch account `nrwbatchpoc`; Why: local job submission uses the operator's own `az login` identity, not the scheduler UAMI.
- **Operator running `rerun-job.sh`** (User):
  - Role: `Key Vault Secrets User`; Scope: Key Vault `nrw-batch-poc`; Why: `rerun-job.sh` reads secrets from the vault under the operator's identity.
- **`Microsoft Azure Batch`** (service principal — ServicePrincipal):
  - Role: `Azure Batch` (orchestration); Scope: subscription; Why: Batch account provisioning (portal setup).
  - Role: `Key Vault Secrets Officer`; Scope: Key Vault `nrw-batch-poc`; Why: Batch account uses the vault for node pool credential management (portal setup).
- **Vault admins** (`ehill@redcross.nl`, `kdepater@redcross.nl` — User):
  - Role: `Key Vault Administrator`; Scope: Key Vault `nrw-batch-poc`; Why: create and rotate pipeline secrets.

Canonical command pattern (substitute principal, role, and scope from the list above):

```bash
# For a managed identity or service principal:
az role assignment create \
  --assignee-object-id <principal-object-id> \
  --assignee-principal-type ServicePrincipal \
  --role "<role>" \
  --scope "<scope>"

# For a human operator, use --assignee-principal-type User.
# Pass --assignee-object-id with an object ID (--assignee with a raw GUID is rejected by
# current Azure CLI versions). --assignee <upn> also works but the grantor needs Entra ID
# read permission to resolve the UPN.
```

Applied assignment IDs (recorded 2026-08-14 for the scheduler UAMI, principal ID `e79c919c-e2b5-4679-9b76-5a047b2cf756`, client ID `37aff145-24fe-40f4-9f35-89da732fd296`): `Key Vault Secrets User` = `f9e3f5fc-518f-4fad-a53b-b58c2ce3252a`; `Azure Batch Job Submitter` = `e0fafe6f-c68e-43cd-b45a-30fe0d910d68`. The pool identity `nrw-batch-poc` (object ID `8d14f658-1ad6-4116-be97-2e0cbb2d74e9`, app ID `b9e311ae-a322-44fd-82ed-6120fb201631`) has its own `Key Vault Secrets User` grant for node access; any earlier `Azure Batch Job Submitter` grant on it is no longer used by the Function App and can be left in place or removed.

## Deployment steps and scripts

All files live under `data/deploy/`.

### One time setup

- `set-secrets.sh` — store pipeline secrets in Key Vault. (If rerun on a live instance, you need to restart the function app. See details below.)
- Create `nrw-batch-scheduler` UAMI + grant its roles (manual CLI) — dedicated Function identity plus `Key Vault Secrets User` and `Azure Batch Job Submitter` grants.
- `apply-lifecycle.sh` (`blob-lifecycle-policy.json`) — apply the Blob Storage retention policy.
- `create-pool.sh` (`pool.json`) — create/recreate the Batch pool.

These run once on first setup (and only again on rotation/policy changes).

- **`set-secrets.sh`** — Runs `az keyvault secret set` for `ibf-pipeline-api-key`, `glofas-ftp-user`, and `glofas-ftp-password` on the `nrw-batch-poc` vault. Reads values from the operator's shell, never hard-codes them. Rerun on secret rotation. Note: this strips the windows line endings so that the secrets are correctly uploaded. **After rerunning `set-secrets.sh`, restart the Function App** (`az functionapp restart --name nrw-batch-scheduler --resource-group nrw-batch-poc`) so it re-resolves the Key Vault references — the resolved secret values are cached and would otherwise stay stale.
- **Create the scheduler identity and grant its roles (completed 2026-08-14)** — The Function App runs as a **dedicated, unrestricted** user-assigned managed identity `nrw-batch-scheduler`. The Batch pool identity `nrw-batch-poc` **cannot** be reused for the Function App: it is a restricted identity (`IdentityAssignmentRestrictions` limit it to `Microsoft.Batch/batchAccounts` providers), so binding it to a `Microsoft.Web/sites` resource fails with `FailedIdentityOperation`. Creating the identity needs only Contributor; the two role grants (`Key Vault Secrets User` on the vault and `Azure Batch Job Submitter` on the Batch account) require Owner / User Access Administrator and are listed in [RBAC prerequisites](#rbac-prerequisites). Create the identity once (idempotent):

  ```bash
  az identity create --name nrw-batch-scheduler --resource-group nrw-batch-poc
  ```

  Then apply the two `nrw-batch-scheduler` grants from the [RBAC prerequisites](#rbac-prerequisites) list.

- **`blob-lifecycle-policy.json` + `apply-lifecycle.sh`** — Blob lifecycle rules matching the retention list in [Blob storage retention](#blob-storage-retention); the script applies them with `az storage account management-policy create`. Idempotent — rerun only when the retention rules change.
- **`create-pool.sh` + `pool.json`** — Wraps the three `az` commands documented in [Pool creation with blob mount](#pool-creation-with-blob-mount-completed-2026-08-13) (delete pool, create from `pool.json`, PATCH managed identity). Run once at initial setup; rerun only if the pool must be recreated (e.g. to change the Blob `mountConfiguration`, which can only be set at pool creation time). Recreation is safe only when the pool is autoscaled to 0 nodes with no jobs running.

### Deploy to Azure

1. `build-and-push-image.sh` — build & push the pipeline Docker image to ACR.
2. `deploy.sh` (`main.bicep`, `parameters.dev.json`) — deploy the Function App + monitoring (Bicep).
3. `publish-function.sh` (`function/`) — deploy the Azure Function code (daily job scheduler).

These are the steps that get run to deploy and redeploy as the code changes. Run in order the first time, but they don't need to all be run as you update.

1. **`build-and-push-image.sh`** — Wraps `az acr login`, `docker build` (context `data/`, from `data/Dockerfile`), and `docker push` to `nrwdockerregistry.azurecr.io/pipelines:latest`. Rerun on every image change. Replaced by CI/CD later. The image **must** be built for the Batch node architecture, `linux/amd64` (the `Standard_E2as_v4` nodes are x86-64). An arm64-only image (e.g. built on an Apple Silicon Mac without a platform override) makes the node go `unusable` with `ContainerInvalidImage` / "no matching manifest for linux/amd64". The script pins `--platform linux/amd64` on the build for this reason (it runs under emulation on arm64 hosts, so it is slower there). Verify the pushed manifest with `docker buildx imagetools inspect nrwdockerregistry.azurecr.io/pipelines:latest`.
2. **`main.bicep` + `parameters.dev.json` + `deploy.sh`** — Bicep deploys the Function App (Consumption plan, bound to the dedicated `nrw-batch-scheduler` user-assigned managed identity) and the `TaskFailEvent` Azure Monitor alert (action group emailing `ehill@redcross.nl`). The template creates **no** role assignments — the UAMI's RBAC is granted once during setup — so `deploy.sh` only needs Contributor on the resource group. `deploy.sh` wraps the `az deployment group create` command already shown below, then captures the `functionAppName` output for `publish-function.sh`. Bicep does **not** recreate the Batch account or pool. Rerun on every infra change. The template also deploys a workspace-based **Application Insights** component (`nrw-batch-scheduler`) backed by the shared **`nrw-app-law`** Log Analytics workspace (in the `NRW` resource group, the same workspace the backend uses), wired to the Function App via the `APPLICATIONINSIGHTS_CONNECTION_STRING` app setting — so pipeline telemetry lands alongside the backend logs (added 2026-08-20; switched to `nrw-app-law` 2026-08-25). Log retention is governed by that shared workspace and left at its default for the POC — revisit post-POC. Routing Batch diagnostic settings to the same workspace is still pending (see [Logging](#logging)).
3. **`function/` (Python Timer Trigger) + `publish-function.sh`** (implemented 2026-08-20) — The daily scheduler; rerun on every scheduler code change:
   - `function_app.py` — Timer trigger at 12:00 UTC (6-field NCRONTAB `0 0 12 * * *`); loops over the in-code `HAZARD_CONFIGS` list and creates one Batch job per hazard. Only **floods** is scheduled for the prototype; drought is a dummy pipeline and tropicalCyclone is not ready yet.
   - `batch_client.py` — Helper that builds the container task (command `pipeline --config pipelines/infra/configs/<hazard>.yaml`, container image `nrwdockerregistry.azurecr.io/pipelines:latest`, env vars, `maxTaskRetryCount = 0`, 10h `maxWallClockTime`) and submits it to the Batch account. Job termination uses `all_tasks_complete_mode = 'terminatejob'` so the pool autoscale scales nodes back to 0. Authenticates to the Batch data plane over Entra ID using the azure-batch 15.x azure-core SDK (`BatchClient` takes a TokenCredential directly): `ManagedIdentityCredential(client_id=os.environ["AZURE_CLIENT_ID"])` when deployed (the `AZURE_CLIENT_ID` app setting is set by `main.bicep` to the UAMI client ID), `DefaultAzureCredential` locally. Job IDs are `nrw-<hazard>-<YYYYMMDD>-<HHMM>`.
   - `host.json`, `requirements.txt` (`azure-functions`, `azure-batch>=15`, `azure-identity`) — Standard Azure Functions Python v2 project files. `azure-batch` is pinned to the 15.x azure-core generation: 14.x (msrest) is legacy and its generated models emit warnings on Python 3.14, while 15.x removed the 14.x `BatchServiceClient` API.
   - `create-local-settings.sh` — Generates the gitignored `function/local.settings.json` for local runs, reading the secret values from `data/.env`. Note: this strips the windows CRLF line endings so that the secrets are correctly uploaded.
   - `publish-function.sh` — Publishes the function code to the deployed Function App.

   **Local testing**: run `./create-local-settings.sh` to generate `function/local.settings.json` from `data/.env`, then `func start` inside `function/` (requires Azurite or a real storage connection for `AzureWebJobsStorage`). Local job submission uses `DefaultAzureCredential` with the operator's `az login` identity, so **that operator needs the `Azure Batch Job Submitter` grant** listed in [RBAC prerequisites](#rbac-prerequisites) (the scheduler UAMI's grants do not apply to a human running locally).

### Helper jobs

- `rerun-job.sh` (`function/rerun_job.py`) — manually rerun a Batch job (reads secrets from Key Vault); example: `./rerun-job.sh floods`.

Run on demand, not part of the normal deploy flow.

- **`rerun-job.sh` + `function/rerun_job.py`** (implemented 2026-08-20) — Submits a single Batch job for a chosen hazard: `./rerun-job.sh <hazard-type> [config-path]` (config path defaults to `pipelines/infra/configs/<hazard-type>.yaml`). The Python entry point imports `function/batch_client.py`, so the job/task construction (container image, command, env vars, `maxTaskRetryCount = 0`, 10h `maxWallClockTime`) is identical to the scheduled runs; the shell script only injects environment variables. Secrets are read with `az keyvault secret show` and passed as task environment variables — never echoed or taken from the command line. `IBF_API_URL` is read from `data/.env`; the remaining values mirror the Function App settings. Auth is the operator's own `az login` identity over Entra ID (the account is AAD-only), so **that operator needs the `Azure Batch Job Submitter` and `Key Vault Secrets User` grants** listed in [RBAC prerequisites](#rbac-prerequisites) (the scheduler UAMI's grants do not apply to a human running the CLI). A Function-based rerun with parameter overrides will replace this later.

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
- Integrate the pool into the NRW Azure VNETs so tasks can reach the NRW backend API and other Azure resources privately (exact connectivity — private endpoint, VNet peering, service endpoint, or public routing — depends on how the API is deployed). The pool subnet is `batch` in `nrw-vnet-test` (`NRW` resource group, `westeurope`), secured by NSG `nrw-NSG-test`. The subnet must **not** have any subnet delegation: a Virtual Machine Configuration pool deploys a VM Scale Set into the subnet, and a delegation (e.g. to `Microsoft.Batch/batchAccounts`, which only applies to the deprecated Cloud Services Configuration pool type) reserves the subnet for that service and makes node allocation fail with `AllocationFailed` / "subnet has delegation to external resources". Remove it with `az network vnet subnet update --resource-group NRW --vnet-name nrw-vnet-test --name batch --remove delegations`.
- Provision the pool with a **user-assigned managed identity** (`nrw-batch-poc`) attached to every node; jobs use it to authenticate to Azure resources such as Storage and Key Vault. The pipeline itself only communicates with the NRW backend API, so no direct database access from the nodes is needed.
- Use the **Ubuntu HPC 24.04** image (`publisher: microsoft-dsvm`, `offer: ubuntu-hpc`, `sku: 2404`, `version: latest`). The container configuration cannot be added to an existing pool; the pool must be created with container support enabled from the start.

### Azure Batch account setup (manual portal setup — current state)

The target subscription is the **AA subscription**. The following resources have already been provisioned in Azure:

- **Resource group** — `nrw-batch-poc`: holds all Batch-related resources.
- **Batch account** — `nrwbatchpoc`: created with Key Vault-based node pool credential management.
- **Key Vault** — `nrw-batch-poc`: RBAC permission model; VM/ARM & ADE enabled; holds pipeline secrets.
- **Storage account** — `nrwbatchpoc`: general-purpose V2; Blob container `nrw-data-cache` mounted as `DATA_CACHE_DIR`.
- **User-assigned managed identity** — `nrw-batch-poc`: assigned to pool nodes.
- **VNet / subnet** — `nrw-vnet-test` / `batch`: subnet `batch` in `nrw-vnet-test` (`NRW` RG, `westeurope`) with **no** subnet delegation (a delegation makes VM Configuration pool allocation fail). NSG: `nrw-NSG-test`. (`nrw-vnet-prod` also exists in `NRW`.)
- **Batch pool ID** — `nrwbatchpoc`: single pool in the Batch account.
- **ACR** — `nrwdockerregistry` (`NRW` RG, login server `nrwdockerregistry.azurecr.io`): reuse the ACR that hosts the featureserv image.

Provisioning a Batch account through the Azure Portal has a few non-obvious requirements:

1. **Do not create a new managed subscription for the node pool resources.** The default GUI option attempts to create a new managed subscription, which will likely fail due to the NLRC subscription-creation policy. Switch this to use the dedicated **Azure Key Vault** (`nrw-batch-poc`) instead.
2. **Register the `Microsoft.Batch` resource provider** in the target subscription before provisioning. ✅ Already registered.
3. **Apply the role assignments** for the `Microsoft Azure Batch` service principal, the vault admins, and the `nrw-batch-poc` pool identity — all listed in [RBAC prerequisites](#rbac-prerequisites).

#### Autoscale formula

This was suggested by Klaas and is in `pool.json`. It should be evaluated when moving from POC to MVP.

## Job scheduling

- **Daily schedule**: A **Python** Azure Function (Timer Trigger, **Consumption plan**) fires daily at **12:00 UTC** and creates one Batch job per hazard. Two nodes each running one job was cheaper than one larger node running all jobs concurrently, so the plan is to run one job per node. This may be changed later.
- **Hazard configs**: 3 YAML configs exist under `pipelines/infra/configs/` (drought, floods, tropicalCyclone), but the scheduler's `HAZARD_CONFIGS` list in `function/function_app.py` currently schedules **floods only**. Drought is currently a dummy pipeline — its real data source will be handled later. More hazards will be added over time by extending `HAZARD_CONFIGS`.
- **Task retries**: Retrying is handled inside the pipeline Python code (e.g. GloFAS FTP downloads and forecast-date resolution already retry with backoff). The Azure Function creating the Batch job sets `maxTaskRetryCount = 0`, so failures surface immediately and are not hidden by Batch-level retries.
- **Job naming**: Jobs are named with a deterministic prefix plus the hazard and a timestamp including day, hour, and minute (e.g. `nrw-floods-20260805-1203`). Because the backend already deduplicates submitted forecasts, rerunning the same day is safe from a data standpoint, but the Batch job ID must still be unique within the account.
- **Manual reruns**: Azure CLI or Azure Portal → Batch account → Jobs → Add.
  - No custom React page for MVP.
  - A rerun via the Azure Function with parameter overrides (e.g. `countries`) will be added later. For now, rerunning through the CLI/portal requires manually supplying all task environment variables, including secret values such as `IBF_PIPELINE_API_KEY`, `GLOFAS_FTP_USER`, and `GLOFAS_FTP_PASSWORD`, or using another method such as a script that reads them from Key Vault.
- The Azure Function is a **Bicep-managed Function App** deployed from this repo; the code lives in [`data/deploy/function/`](../deploy/function/) and is published with `publish-function.sh`.
- The Azure Function runs under a managed identity and can fetch secrets (e.g., GloFAS FTP credentials) from **Azure Key Vault**, injecting them as environment variables into task containers.
- **Container task command** — The Batch task command mirrors local invocation: `pipeline --config pipelines/infra/configs/floods.yaml`. The `pipeline` entry point is declared in `pyproject.toml`; the YAML config under `pipelines/infra/configs/` selects the hazard and countries. The Function schedules one job per entry in its `HAZARD_CONFIGS` list. The config path is **relative**, so the task must run from the image `WORKDIR` (`/home/pipelines/app`, where `data/Dockerfile`'s `COPY . .` places the baked-in configs). Azure Batch otherwise defaults the container working directory to the Batch task working directory (a per-task folder bind-mounted into the container), which makes the relative path fail with `Invalid value for '--config': Path '...' does not exist`. `batch_client.py` therefore sets `BatchTaskContainerSettings(working_directory=ContainerWorkingDirectory.CONTAINER_IMAGE_DEFAULT)` so the task runs from the image `WORKDIR`.

## Storage

- **Azure Blob Storage**: GloFAS global downloads (~600 MB per file, ~30 GB total for a daily set of ~50 files), country split outputs, debug/dev data, and large result payloads. Only one GloFAS file is loaded at a time, so peak working storage is ~600 MB–1 GB. All downloaded GloFAS files are written to Blob Storage.

### Blob storage retention

The pipeline already writes to subdirectories under `DATA_CACHE_DIR` as defined in `pipelines/infra/utils/storage_helpers.py`. Configure Azure Blob lifecycle management policies per prefix:

- `glofas/raw/{forecast_date}/`
  - Content: global GloFAS downloads
  - Retention: 30 days
- `glofas/country_split/{forecast_date}/`
  - Content: country-split GloFAS data (for development)
  - Retention: indefinite (revisit later)
- `glofas/country_split_alert/{forecast_date}/`
  - Content: country-split data that triggered alerts
  - Retention: indefinite

NOAA data is not yet integrated into the pipeline; retention rules for NOAA will be added when that data source is introduced.

## Out of scope for first prototype

### Evaluate after first prototype is running

- **Logging and retention**: Validate what Azure Batch streams to the Log Analytics workspace, decide on Log Analytics / Application Insights retention for the text logs (not fixed for the POC — consider post-POC; see [Logging](#logging)) and Blob Storage retention for raw logfiles, and finalize an aggregate log analysis strategy.
- **Full job failure and "no run" detection**: Batch-level retries are disabled (`maxTaskRetryCount = 0`), so a fully failed task means no run that day unless someone reruns it manually, and the current `TaskFailEvent` email alert only covers tasks that actually started and then failed. Add monitoring that fires when a scheduled daily job fails outright or never runs at all (dead-man's-switch), so pipeline health is visible even on days when no alerts are produced.
- **Test Batch account**: Set up a separate Batch account for dry-run validation of new pipeline definitions before production deployment. Minimize costs by using a smaller VM size (e.g., A-series) for tests that do not require the full 12 GB memory footprint.
- **Managed identity database auth**: Not applicable for the Batch pipeline — all database access goes through the NRW backend API. Revisit only if a future pipeline component needs direct database connectivity.
- **CI/CD image builds**: Set up a GitHub Actions workflow to build and push the Docker image to ACR on merge to main (tag by commit SHA or date). Until then, the image is built and pushed locally.
- Confirm Azure Batch quota and VM family limits in target subscription for `Standard_E2as_v4`.
- Measure actual peak memory during a full run to validate the `Standard_E2as_v4` choice.
- We need to set up data input for a test env for this so we can have predictable tests. This may be on the country level, or maybe we need to cache an alert generating global glofas file somewhere (such as in a new folder in blob storage).

### Handle after MVP or as need arises

- **Retention re-evaluation**: Re-evaluate retention periods for both logs (Log Analytics workspace) and stored data (Blob lifecycle policies) after MVP, and adjust as needed.
- **Data caching**: There are two types of data we could cache: PostGis DB data (admin areas, roads, buildings) and static data (population source image). Consider caching this later. It would need resources set up in azure, and code change in the pipelines. For now, it pulls from the backend directly.
- **Logging**: Consider structured JSON logging (rather than tagged strings) if dashboards and alerts need richer filtering.
- **ADX for logging**: Consider Azure Data Explorer (ingested via Event Hub) as a dedicated log store only if log volume, retention, or cross-source querying make Log Analytics unattractive (ADX has a ~$100/month minimum). Log Analytics + Application Insights is the default and is expected to be sufficient.
- **Production VNet**: `nrw-vnet-prod` exists in the `NRW` resource group alongside `nrw-vnet-test`. Production deployment will use `nrw-vnet-prod`; for the prototype only `nrw-vnet-test` is used.
- **Additional hazard pipelines**: Drought real data source, cyclones, and other hazards beyond the initial 3.
- **NOAA data source**: Not yet integrated. Add retention policies and env vars when introduced.
- **Additional environments**: Only `test` (`IBF_ENVIRONMENT=test`) is used for the prototype. Production and other environments will be configured after the prototype.

## Logging

Logging uses a workspace-based **Application Insights** component (`nrw-batch-scheduler`) backed by the shared **`nrw-app-law`** Log Analytics workspace in the `NRW` resource group — the same workspace the NRW backend logs to (switched from a dedicated workspace on 2026-08-25). Because the component is workspace-based, its telemetry lands in the `nrw-app-law` workspace tables, so pipeline and backend logs can be queried together (e.g. a KQL `union`, or filtering by `cloud_RoleName`). The scheduler Function App is connected to it, giving portal invocation history, failures, Live Metrics, and KQL queries over the function's `logging` traces.

**Pipeline task logs** (added 2026-08-21): the pipeline entrypoint (`run_forecasts.py`) attaches `azure-monitor-opentelemetry`'s `configure_azure_monitor` to the root logger when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, so all pipeline `logging` output (including the `tag_*` tags from `pipelines/infra/utils/nrw_logger.py`) lands in the same App Insights component as the scheduler, queryable in the `traces`/`exceptions` tables. `batch_client.py` forwards the Function App's `APPLICATIONINSIGHTS_CONNECTION_STRING` app setting onto each Batch task; `rerun-job.sh` reads the same connection string with `az monitor app-insights component show`. The wiring is additive to `logging.basicConfig`, so console output (Batch task `stdout.txt`/`stderr.txt`, local runs) is unchanged, and local runs without the env var export nothing. Azure Batch's built-in stdout/stderr files in Portal and Batch Explorer remain as a fallback. Note that the `stdout.txt`/`stderr.txt` files are only there while the node is alive. Once it is removed, you can only get the logs from App Insights → Logs.

**Network requirement**: Batch nodes must reach the App Insights ingestion endpoint (HTTPS 443 to `dc.services.visualstudio.com`, covered by the `AzureMonitor` service tag). If telemetry stops arriving, check the egress rules on NSG `nrw-NSG-test`.

Retention and Batch diagnostics:

- **Text logs contain no PII.** Log retention is governed by the shared `nrw-app-law` workspace and is not fixed for the POC — consider an appropriate period post-POC. Log Analytics supports up to 730 days of interactive retention plus cheaper archive beyond, so no extra service is required.
- **Azure Batch diagnostics** (node/task lifecycle events, metrics) are routed straight to the same `nrw-app-law` workspace via **Diagnostic Settings** — no Event Hub is needed when Log Analytics is the sink.
- Pipeline code emits tagged `logging` output (the `tag_*` tags from `pipelines/infra/utils/nrw_logger.py`), queryable in the `traces` table alongside the scheduler logs.

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

- `IBF_ENVIRONMENT`
  - Value: `test` (prototype)
  - How to set: must match one of the values accepted by `pipelines.infra.environment.load_environment_settings()`. Use `test` for the prototype; other environments after.
- `IBF_API_URL`
  - Value: e.g. `https://<app-name>.azurewebsites.net`
  - How to set: set to the NRW backend API base URL for the target environment. The `ApiClient` appends `/api/...` paths, so do not include `/api` here.
- `IBF_PIPELINE_API_KEY`
  - Value: from Key Vault secret `ibf-pipeline-api-key`
  - How to set: injected by the Azure Function from Key Vault as a secure environment variable on the Batch task. Required by `ApiClient` for backend authentication.
- `GITHUB_DATA_BASE_URL`
  - Value: `https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main`
  - How to set: hard-coded URL used for seed data (e.g. flood extents). Required by the floods config even for live runs because `flood_extents_seed_repo` is always loaded.
- `GLOFAS_FTP_HOST`
  - Value: `aux.ecmwf.int`
  - How to set: hard-coded ECMWF GloFAS FTP host.
- `GLOFAS_FTP_USER`
  - Value: from Key Vault secret `glofas-ftp-user`
  - How to set: injected by the Azure Function from Key Vault as a secure environment variable on the Batch task.
- `GLOFAS_FTP_PASSWORD`
  - Value: from Key Vault secret `glofas-ftp-password`
  - How to set: injected by the Azure Function from Key Vault as a secure environment variable on the Batch task.
- `DATA_CACHE_DIR`
  - Value: `/mnt/batch/tasks/fsmounts/nrw-data-cache`
  - How to set: must match the Blob Storage mount path configured on the Batch pool.

`SEED_DATA_REPO_ROOT` is not needed in production — it is only used for local dev/test seed data loading. `GITHUB_DATA_BASE_URL` (which points to the same seed data over HTTPS) is still required.

## Key Vault secrets

All secrets used by the pipeline and scheduling infrastructure are stored in a single Azure Key Vault instance. The scheduler Function App runs as the dedicated `nrw-batch-scheduler` user-assigned managed identity, which has the `Key Vault Secrets User` role on this vault, allowing the Function host to resolve the Key Vault references in its app settings and inject the secrets as Batch task environment variables at job creation time.

### Required secrets

- `ibf-pipeline-api-key` — API key for the NRW backend (`IBF_PIPELINE_API_KEY`).
- `glofas-ftp-user` — ECMWF GloFAS FTP username (`GLOFAS_FTP_USER`).
- `glofas-ftp-password` — ECMWF GloFAS FTP password (`GLOFAS_FTP_PASSWORD`).

### Key Vault configuration notes

- Use the **RBAC permission model** (not access policies) for the vault so permissions are managed via Azure AD role assignments.
- The vault's role assignments (for the scheduler UAMI, pool node UAMI, `Microsoft Azure Batch` service principal, and vault admins) are listed in [RBAC prerequisites](#rbac-prerequisites).
- Enable **soft delete** and **purge protection** (defaults on new vaults) to prevent accidental permanent loss.
- Secrets should follow kebab-case naming (e.g., `ibf-pipeline-api-key`).
- Rotate `ibf-pipeline-api-key` by updating both the Key Vault secret and the NRW backend's accepted key list. The next scheduled job picks up the new value automatically.
- The Key Vault referenced during Batch account creation (for node pool credential management) can be the same vault or a separate one depending on access boundary preferences.
