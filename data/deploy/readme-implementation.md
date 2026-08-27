# Pipeline cloud deployment plan

The general requirements this plan implements are in [deploy_requirements.md](deploy_requirements.md); this document is the practical implementation overview.

## Overview

Azure Batch deployment for the NRW forecast pipeline.

## Permissions

- Subscription: `57b0d17a-5429-4dbb-8366-35c928e3ed94`
- Key Vault scope: `/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.KeyVault/vaults/nrw-batch-poc`
- Batch account scope: `/subscriptions/57b0d17a-5429-4dbb-8366-35c928e3ed94/resourceGroups/nrw-batch-poc/providers/Microsoft.Batch/batchAccounts/nrwbatchpoc`

Azure accounts

- **`nrw-batch-scheduler`** (Function App UAMI — ServicePrincipal):
  - Role: `Key Vault Secrets User`; Scope: Key Vault `nrw-batch-poc`; Why: resolve the Key Vault app-setting references in the Function App.
  - Role: `Azure Batch Job Submitter`; Scope: Batch account `nrwbatchpoc`; Why: create Batch jobs over Entra ID (account is AAD-only).
- **`nrw-batch-poc`** (pool node UAMI — ServicePrincipal):
  - Role: `Key Vault Secrets User`; Scope: Key Vault `nrw-batch-poc`; Why: pool nodes read secrets from the vault.
  - Role: `Storage Blob Data Contributor`; Scope: Blob container `nrw-data-cache` on storage account `nrwbatchpoc`; Why: Blob mount used as `DATA_CACHE_DIR`.
- **`Microsoft Azure Batch`** (service principal — ServicePrincipal):
  - Role: `Azure Batch` (orchestration); Scope: subscription; Why: Batch account provisioning (portal setup).
  - Role: `Key Vault Secrets Officer`; Scope: Key Vault `nrw-batch-poc`; Why: Batch account uses the vault for node pool credential management (portal setup).

User accounts:

- **Create and rotate pipeline secrets**
  - Role: `Key Vault Administrator`; Scope: Key Vault `nrw-batch-poc`
- **To run `func start`**
  - Role: `Azure Batch Job Submitter`; Scope: Batch account `nrwbatchpoc`; Why: local job submission uses the operator's own `az login` identity, not the scheduler UAMI.
- **To run `rerun-job.sh`**
  - Role: `Key Vault Secrets User`; Scope: Key Vault `nrw-batch-poc`
  - Role: `Azure Batch Job Submitter`; Scope: Batch account `nrwbatchpoc`

## Deployment steps and scripts

All files live under `data/deploy/`.

### One time setup

- `set-secrets.sh` — store pipeline secrets in Key Vault. (If rerun this on a live instance, you need to restart the function app. (`az functionapp restart --name nrw-batch-scheduler --resource-group nrw-batch-poc`))
- Create `nrw-batch-scheduler` UAMI + grant its roles (manual CLI) — dedicated Function identity plus `Key Vault Secrets User` and `Azure Batch Job Submitter` grants.
- `apply-lifecycle.sh` (`blob-lifecycle-policy.json`) — apply the Blob Storage retention policy.
- `create-pool.sh` (`pool.json`) — create/recreate the Batch pool with the blob mount configured.

These run once on first setup (and only again on rotation/policy changes).

### Deploy to Azure

Run these in order the first time, but after that, you can just run the ones that are updated.

1. `build-and-push-image.sh` — build & push the pipeline Docker image to ACR. Note that YAML configs (`pipelines/infra/configs/*.yaml`) are baked into the image, so adding a country or changing data sources requires a new build+push.
2. `deploy.sh` (`main.bicep`, `parameters.dev.json`) — deploy the Function App + monitoring (Bicep).
3. `publish-function.sh` (`function/`) — deploy the Azure Function code (daily job scheduler).

### Helper jobs

- `rerun-job.sh` (`function/rerun_job.py`) — manually rerun a Batch job (reads secrets from Key Vault); example: `./rerun-job.sh floods`.

## Compute

- **Azure Batch** account with a container-enabled pool.
- Treat the Batch account as a **permanent resource** rather than deploying it on-the-fly, to avoid single points of failure.
- Initial VM SKU: `Standard_E2as_v4`
- Docker image is pulled from the existing **NRW Azure Container Registry (ACR)**
  - Registry resource group: `NRW`
  - Registry name: `nrwdockerregistry`
  - Login server: `nrwdockerregistry.azurecr.io`
  - Build context: repo root `/data`
  - Image: `nrwdockerregistry.azurecr.io/pipelines:latest`
  - ACR integration: the pool is already attached to `nrwdockerregistry` and configured to prefetch `nrwdockerregistry.azurecr.io/pipelines:latest` so tasks start quickly
- Integrate the pool into the NRW Azure VNETs so tasks can reach the NRW backend API and other Azure resources privately (exact connectivity — private endpoint, VNet peering, service endpoint, or public routing — depends on how the API is deployed). The pool subnet is `batch` in `nrw-vnet-test` (`NRW` resource group, `westeurope`), secured by NSG `nrw-NSG-test`. The subnet must **not** have any subnet delegation: a Virtual Machine Configuration pool deploys a VM Scale Set into the subnet, and a delegation (e.g. to `Microsoft.Batch/batchAccounts`, which only applies to the deprecated Cloud Services Configuration pool type) reserves the subnet for that service and makes node allocation fail with `AllocationFailed` / "subnet has delegation to external resources". Remove it with `az network vnet subnet update --resource-group NRW --vnet-name nrw-vnet-test --name batch --remove delegations`.
- Provision the pool with a **user-assigned managed identity** (`nrw-batch-poc`) attached to every node; jobs use it to authenticate to Azure resources such as Storage and Key Vault. The pipeline itself only communicates with the NRW backend API, so no direct database access from the nodes is needed.
- Use the **Ubuntu HPC 24.04** image (`publisher: microsoft-dsvm`, `offer: ubuntu-hpc`, `sku: 2404`, `version: latest`). The pool must be created with container support enabled from the start.

### Azure Batch account setup

- **Resource group** — `nrw-batch-poc`: holds all Batch-related resources.
- **Batch account** — `nrwbatchpoc`: created with Key Vault-based node pool credential management.
- **Key Vault** — `nrw-batch-poc`: RBAC permission model; VM/ARM & ADE enabled; holds pipeline secrets.
- **Storage account** — `nrwbatchpoc`: general-purpose V2; Blob container `nrw-data-cache` mounted as `DATA_CACHE_DIR`.
- **User-assigned managed identity** — `nrw-batch-poc`: assigned to pool nodes.
- **VNet / subnet** — `nrw-vnet-test` / `batch`: subnet `batch` in `nrw-vnet-test` (`NRW` RG, `westeurope`) with **no** subnet delegation (a delegation makes VM Configuration pool allocation fail). NSG: `nrw-NSG-test`. (`nrw-vnet-prod` also exists in `NRW`.)
- **Batch pool ID** — `nrwbatchpoc`: single pool in the Batch account.
- **ACR** — `nrwdockerregistry` (`NRW` RG, login server `nrwdockerregistry.azurecr.io`): reuse the ACR that hosts the featureserv image.

## Storage

- **Azure Blob Storage**: GloFAS global downloads (~600 MB per file, ~30 GB total for a daily set of ~50 files), country split outputs, debug/dev data, and large result payloads. Only one GloFAS file is loaded at a time, so peak working storage is ~600 MB–1 GB. All downloaded GloFAS files are written to Blob Storage.

- **Blob storage rentention**: `glofas/raw` has the limit set in `data/deploy/blob-lifecycle-policy.json`. For `glofas/country_split` and `glofas/country_split_alert`, they are not shown in that file since we want them to be indefinite at first, and the default setting is an indefinite period.

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

### To do or evaluate after first prototype is running

- **Additional environments**: Only `test` (`IBF_ENVIRONMENT=test`) is used for the prototype.
- **Logging and retention**: Re-eval retention periods for logs and files.
- **"no run" Alerts**: Consider alerts if there were no runs
- **Test Batch account**: How do we do test runs? Do we need a new batch account to do this?
- **CI/CD image builds**: Currently the image is built and pushed locally.
- Confirm Azure Batch quota and VM family limits in target subscription for `Standard_E2as_v4`. Also measure actual peak memory during a full run to validate the choice.
- We need to set up data input for a test env for this so we can have predictable tests. This may be on the country level, or maybe we need to cache an alert generating global glofas file somewhere (such as in a new folder in blob storage).
- Re-evaluate the pool autoscale formula

### Handle after MVP or as need arises

- **Data caching**: There are two types of data we could cache: PostGis DB data (admin areas, roads, buildings) and static data (population source image). For now, it is pulled from the backend.

## Logging

Logging uses a workspace-based **Application Insights** component (`nrw-batch-scheduler`) backed by the shared **`nrw-app-law`** Log Analytics workspace in the `NRW` resource group

## Network requirements

- Batch nodes must reach the App Insights ingestion endpoint (HTTPS 443 to `dc.services.visualstudio.com`, covered by the `AzureMonitor` service tag).

- The pool is in subnet `batch` of `nrw-vnet-test` (`NRW` RG). Nodes must reach:

  - **NRW API** — over a private endpoint, VNet peering, or public routing. If the API uses a Private Endpoint, link the corresponding **Private DNS Zone** (e.g. `privatelink.azurewebsites.net`) to `nrw-vnet-test` so DNS resolves correctly.
  - **ACR** — `nrwdockerregistry.azurecr.io`. If the registry uses a private endpoint, link its DNS zone to `nrw-vnet-test`; otherwise the subnet must allow outbound HTTPS (443) to the registry's public endpoint. The UAMI `nrw-batch-poc` is used for image pull authentication.
  - **Blob Storage** — `nrwbatchpoc.blob.core.windows.net`. The Blob mount works over HTTPS (443); add a service endpoint or private endpoint for `Microsoft.Storage` on the `batch` subnet if public access is restricted.
  - **GloFAS FTP** — `aux.ecmwf.int` on port 21 + passive high ports (1024–65535).

#### NSG / firewall rules

The subnet's NSG is `nrw-NSG-test`. It currently has no custom outbound rules, so Azure defaults allow the required outbound traffic. If the NSG is later locked down, explicitly allow:

- HTTPS (443) to the ACR (`nrwdockerregistry.azurecr.io`) and Blob Storage (`nrwbatchpoc.blob.core.windows.net`).
- FTP control (port 21) and passive data ports (1024–65535) to `aux.ecmwf.int`.

## Environment variables and secrets

### Env vars

Set these in `data/.env`. See `data/.env.example` for which need to be set and which don't for production.

### Key Vault secrets

Note: The vault uses the RBAC permission model.

- `ibf-pipeline-api-key` — API key for the NRW backend (`IBF_PIPELINE_API_KEY`).
- `glofas-ftp-user` — ECMWF GloFAS FTP username (`GLOFAS_FTP_USER`).
- `glofas-ftp-password` — ECMWF GloFAS FTP password (`GLOFAS_FTP_PASSWORD`).
