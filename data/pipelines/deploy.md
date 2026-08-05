# Pipeline cloud deployment plan

> Work-in-progress plan for moving NRW Python pipeline jobs from local/scheduled runs to Azure Batch.
> Last updated: 2026-08-05

## Overview

Run the existing [data/Dockerfile](../../Dockerfile) based pipeline as container tasks on Azure Batch.
One job is created per hazard per day. The job downloads shared data (i.e. for flood hazard job, GloFAS global data is downloaded and split by country), runs the forecast pipeline for each target country, and sends results to the NRW backend API.

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
- Use the **Ubuntu HPC** image (or another image that supports container workloads). The container configuration cannot be added to an existing pool; the pool must be created with container support enabled from the start.

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

- **Daily schedule**: Azure Function Timer Trigger creates one Batch job per hazard per day. Two nodes each running one job was cheaper than one larger node running all jobs concurrently, so the plan is to run one job per node. This may be changed later.
- **Manual reruns**: Azure CLI or Azure Portal → Batch account → Jobs → Add.
  - No custom React page for MVP.
  - Design the Azure Function payload for manual reruns with parameter overrides (e.g. `countries`, etc.).
- The Azure Function is a **Bicep-managed Function App** deployed from this repo (code will live under `data/deploy/`).
- The Azure Function runs under a managed identity and can fetch secrets (e.g., GloFAS FTP credentials) from **Azure Key Vault**, injecting them as environment variables into task containers.
- **Container task command** — The Batch task command mirrors local invocation, e.g.: `pipeline --config pipelines/infra/configs/floods.yaml`. The `pipeline` entry point is declared in `pyproject.toml`; the YAML config under `pipelines/infra/configs/` selects the hazard and countries. The Function will schedule one job per config/hazard.

## Storage

- **Azure Blob Storage**: GloFAS global downloads (~600 MB per file, ~30 GB total for a daily set of ~50 files), country split outputs, debug/dev data, and large result payloads. Only one GloFAS file is loaded at a time, so peak working storage is ~600 MB–1 GB. All downloaded GloFAS files are written to Blob Storage.

### Blob storage retention

Retention will be decided later, but here are is what we will start with. We need separate dirs for these, that the pipeline will write to in an appropritate folder.

- 30 Days: global glofas and NOAA data.
- Indefinitely: Country-split glofas data. This is for development. Later this setting will need to change.
- Indefinitely: Country-split glofas data that generates an alert (creates an event sent to the IBF backend) on the pipeline.

## Out of scope for first prototype

### Evaluate after first prototype is running

- **Logging and retention**: Validate what Azure Batch streams to Azure Monitor, decide on Blob Storage / Application Insights retention for raw logfiles, and finalize an aggregate log analysis strategy.
- **Test Batch account**: Set up a separate Batch account for dry-run validation of new pipeline definitions before production deployment. Minimize costs by using a smaller VM size (e.g., A-series) for tests that do not require the full 12 GB memory footprint.
- **Managed identity database auth**: Not applicable for the Batch pipeline — all database access goes through the NRW backend API. Revisit only if a future pipeline component needs direct database connectivity.
- **CI/CD image builds**: Set up a GitHub Actions workflow to build and push the Docker image to ACR on merge to main (tag by commit SHA or date). Until then, the image is built and pushed locally.
- Confirm Azure Batch quota and VM family limits in target subscription for `Standard_E2as_v4`.
- Measure actual peak memory during a full run to validate the `Standard_E2as_v4` choice.
- Confirm ADX cluster SKU and streaming ingestion needs for live monitoring.

### Handle after MVP or as need arises

- **Data caching**: There are two types of data we could cache: PostGis DB data (admin areas, roads, buildings) and static data (population source image). Consider caching this later. It would need resources set up in azure, and code change in the pipelines. For now, it pulls from the backend directly.
- **Logging**: Consider structured JSON logging (rather than tagged strings) if dashboards and alerts need richer filtering.

## Logging

- **Azure Data Explorer (ADX)** is the primary log store.
- Azure Batch diagnostics are routed via Event Hub into ADX.
- Pipeline code emits `print()` lines with a leading tag to be easily found in ADX.
- Retention: If possible, we want a long retention policy, 180 days if possible, but 90 days might be fine. 30 is too short. The logs will not contain PII.

## Failure visibility

- **Email notifications**: Azure Monitor alert rule on Batch `TaskFailEvent`.
- **Azure Portal**: Batch account → Jobs → Tasks for status and logs.
- **Azure Batch Explorer**: free Microsoft desktop app for richer run/task inspection.

## Infrastructure as code

- Use **Bicep** templates stored under `data/deploy/` in this repo.
- Deploy with Azure CLI:

```bash
az deployment group create \
  --resource-group rg-nrw-pipelines \
  --template-file data/deploy/main.bicep \
  --parameters data/deploy/parameters.dev.json
```

### Check before deploy

1. **Blob Storage mount** — Mount the `nrw-data-cache` container from storage account `nrwbatchpoc` at `DATA_CACHE_DIR` via the pool's `mountConfiguration`. The pipeline loads only one GloFAS file at a time, so peak working storage is ~600 MB–1 GB. Blob Storage is used as the working cache for downloads and country splits, and it persists data across retries.

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
| `IBF_ENVIRONMENT`      | `development`, `test`, or `production`                                      | Must match one of the values accepted by `pipelines.infra.environment.load_environment_settings()`. Use `production` for the production Batch workload.      |
| `IBF_API_URL`          | e.g. `https://<app-name>.azurewebsites.net`                                 | Set to the NRW backend API base URL for the target environment. The `ApiClient` appends `/api/...` paths, so do not include `/api` here.                     |
| `IBF_PIPELINE_API_KEY` | (from Key Vault secret `ibf-pipeline-api-key`)                              | Injected by the Azure Function from Key Vault as a secure environment variable on the Batch task. Required by `ApiClient` for backend authentication.        |
| `GITHUB_DATA_BASE_URL` | `https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main` | Hard-coded URL used for seed data (e.g. flood extents). Required by the floods config even for live runs because `flood_extents_seed_repo` is always loaded. |
| `GLOFAS_FTP_HOST`      | `aux.ecmwf.int`                                                             | Hard-coded ECMWF GloFAS FTP host.                                                                                                                            |
| `DATA_CACHE_DIR`       | `/mnt/batch/tasks/fsmounts/nrw-data-cache`                                  | Must match the Blob Storage mount path configured on the Batch pool.                                                                                         |

`SEED_DATA_REPO_ROOT` is not needed in production — it is only used for local dev/test seed data loading. `GITHUB_DATA_BASE_URL` (which points to the same seed data over HTTPS) is still required.

## Key Vault secrets

All secrets used by the pipeline and scheduling infrastructure are stored in a single Azure Key Vault instance. The scheduling Azure Function's managed identity has `Key Vault Secrets User` role on this vault, allowing it to read secrets and inject them as Batch task environment variables at job creation time.

### Required secrets

| Secret name            | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `ibf-pipeline-api-key` | API key for the NRW backend (`IBF_PIPELINE_API_KEY`) |
| `glofas-ftp-user`      | ECMWF GloFAS FTP username (`GLOFAS_FTP_USER`)        |
| `glofas-ftp-password`  | ECMWF GloFAS FTP password (`GLOFAS_FTP_PASSWORD`)    |

### Key Vault configuration notes

- Use the **RBAC permission model** (not access policies) for the vault so permissions are managed via Azure AD role assignments.
- Grant `Key Vault Secrets User` to the Azure Function's managed identity and to the Batch pool's user-assigned managed identity (if tasks need to fetch secrets directly).
- Grant `Key Vault Secrets Officer` to the ops/admin group for secret rotation.
- Enable **soft delete** and **purge protection** (defaults on new vaults) to prevent accidental permanent loss.
- Secrets should follow kebab-case naming (e.g., `ibf-pipeline-api-key`).
- Rotate `ibf-pipeline-api-key` by updating both the Key Vault secret and the NRW backend's accepted key list. The next scheduled job picks up the new value automatically.
- The Key Vault referenced during Batch account creation (for node pool credential management) can be the same vault or a separate one depending on access boundary preferences.
