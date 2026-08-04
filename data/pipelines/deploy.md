# Pipeline cloud deployment plan

> Work-in-progress plan for moving NRW Python pipeline jobs from local/scheduled runs to Azure Batch.
> Last updated: 2026-08-04

## Overview

Run the existing [data/Dockerfile](../../Dockerfile) based pipeline as container tasks on Azure Batch.
One job is created per hazard per day. Each job downloads GloFAS global data, splits it by country, runs the forecast pipeline, and sends results to the NRW backend API.

## Compute

- **Azure Batch** account with a container-enabled pool.
- Treat the Batch account as a **permanent resource** rather than deploying it on-the-fly, to avoid single points of failure. (See following section for more details on batch account set up).
- Initial VM SKU: `Standard_D4s_v5` (16 GB). Only cosider `Standard_D4ds_v5` if we later decide we need local temp storage.
- Pool autoscales from **0 to 2 nodes** to keep costs low when idle; the pool nodes represent the majority of cost. Set max to 2 nodes. Once the job queue is empty, the VM is deleted so no compute cost remains.
- Task `maxWallClockTime`: **10 hours**. If a task exceeds this, Batch kills it and marks it failed. Evaluate this timeout once we have real-world run duration data.
- Docker image is pulled from **Azure Container Registry (ACR)**.
  - Build context: repo root `/data`
  - Image: `nrwpipelines.azurecr.io/pipeline:latest` (name TBD)
- Integrate the pool into the NRW Azure VNETs so tasks can reach private resources such as the database.
- Provision the pool with a **user-assigned managed identity** attached to every node; jobs use it to authenticate to Azure resources such as Storage. Database authentication via managed identity is possible, but we need to verify that the Python database driver refreshes short-lived tokens, otherwise connections will fail after roughly an hour.

### Azure Batch account setup (if done manually via the portal)

Provisioning a Batch account through the Azure Portal has a few non-obvious requirements:

1. **Do not create a new managed subscription for the node pool resources.** The default GUI option attempts to create a new managed subscription, which will likely fail due to the NLRC subscription-creation policy. Switch this to use a dedicated **Azure Key Vault** resource instead.
2. **Register the `Microsoft.Batch` resource provider** in the target subscription before provisioning.
3. **Assign a role on the subscription** to the service principal that the Batch account creation process creates.
4. **Create a dedicated Key Vault** and assign the same service principal another role on it, so the Batch account can use it for node pool credential management.

Note: Klaas can set this up in the needed subscription (e.g. the AA subscription). (and is planning to do so on Aug 4)

## Job scheduling

- **Daily schedule**: Azure Function Timer Trigger creates one Batch job per hazard per day. Only one job runs at a time (sequential, not concurrent).
- **Manual reruns**: Azure CLI or Azure Portal → Batch account → Jobs → Add.
  - No custom React page for MVP.
- The Azure Function is a **Bicep-managed Function App** deployed from this repo (code will live under `data/deploy/`).
- The Azure Function runs under a managed identity and can fetch secrets (e.g., database password, GloFAS FTP credentials) from **Azure Key Vault**, injecting them as environment variables into task containers.

## Storage

- **Azure Blob Storage**: GloFAS global downloads (~600 MB per file, ~30 GB total for a daily set of ~50 files), country split outputs, debug/dev data, and large result payloads. Only one GloFAS file is loaded at a time, so peak working storage is ~600 MB–1 GB. All downloaded GloFAS files are written to Blob Storage.

## Out of scope

### Evaluate after first prototype is running

- **Logging and retention**: Validate what Azure Batch streams to Azure Monitor, decide on Blob Storage / Application Insights retention for raw logfiles, and finalize an aggregate log analysis strategy.
- **Test Batch account**: Set up a separate Batch account for dry-run validation of new pipeline definitions before production deployment. Minimize costs by using a smaller VM size (e.g., A-series) for tests that do not require the full 12 GB memory footprint.
- **Managed identity database auth**: Verify that the Python database connection library refreshes short-lived tokens; if not, connections will fail after about an hour.
- **CI/CD image builds**: Set up a GitHub Actions workflow to build and push the Docker image to ACR on merge to main (tag by commit SHA or date). Until then, the image is built and pushed locally.

### Handle after MVP or as need arises

- **Data caching**: There are two types of data we could cache: PostGis DB data (admin areas, roads, buildings) and static data (population source image). Consider caching this later. It would need resources set up in azure, and code change in the pipelines. For now, it pulls from the backend directly.
- **Logging**: Consider structured JSON logging (rather than tagged strings) if dashboards and alerts need richer filtering.

## Logging

- **Azure Data Explorer (ADX)** is the primary log store.
- Azure Batch diagnostics are routed via Event Hub into ADX.
- Pipeline code emits `print()` lines with a leading tag to be easily found in ADX.
- Also persist raw pipeline logfiles to **Azure Blob Storage** and/or **Application Insights** for long-term forensics and aggregate analysis. Console log retention may not be a built-in Batch feature, so we should validate what Azure Batch actually streams to Azure Monitor during the prototype and design the retention strategy accordingly.

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

## Open questions / next steps

- Confirm Azure Batch quota and VM family limits in target subscription.
- Decide final ACR name and image tagging strategy.
- Measure actual peak memory during a full run to pick the right VM SKU.
- Confirm ADX cluster SKU and streaming ingestion needs for live monitoring.
- Design the Azure Function payload for manual reruns with parameter overrides (e.g. `countries`, `date`, `skipDownload`).

## Data Pipeline Setup

** Notes: this section and below relate only to the python data pipeline project setup **

The Python pipeline container requires no code changes to run in Azure Batch. The following environment variables must be set as task environment variables (injected by the scheduling Azure Function from Key Vault):

| Variable               | Cloud value                                                                 | Notes                                 |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| `IBF_ENVIRONMENT`      |                                                                             |
| `IBF_API_URL`          | API endpoint depending on env run on                                        | Must be reachable from the Batch VNet |
| `IBF_PIPELINE_API_KEY` | Production API key                                                          | From Key Vault                        |
| `GITHUB_DATA_BASE_URL` | `https://raw.githubusercontent.com/rodekruis/IBF-seed-data/refs/heads/main` | For mock data for test runs           |
| `GLOFAS_FTP_USER`      | ECMWF FTP username                                                          | From Key Vault                        |
| `GLOFAS_FTP_PASSWORD`  | ECMWF FTP password                                                          | From Key Vault                        |
| `GLOFAS_FTP_HOST`      | `aux.ecmwf.int`                                                             | Standard host                         |
| `DATA_CACHE_DIR`       | `/mnt/batch/tasks/fsmounts/data-cache`                                      | Blob Storage mount                    |

`SEED_DATA_REPO_ROOT` is not needed in production — it is only used for local dev/test seed data loading.

### Additional setup steps

1. **Build & push the Docker image** — Build from `data/Dockerfile` (context: repo root `/data`) and push to ACR. For the initial prototype, the image is built and pushed locally; CI/CD automation comes later.
2. **Network connectivity** — The Batch pool's VNet/subnet must reach the API service (private endpoint or VNet peering) and `aux.ecmwf.int` (FTP outbound).
   - If the API uses a Private Endpoint, link the corresponding **Private DNS Zone** (e.g. `privatelink.azurewebsites.net`) to the Batch pool's VNet so DNS resolves correctly.
3. **FTP passive mode firewall rules** — GloFAS FTP uses passive mode with a random high data port. The NSG on the Batch subnet needs outbound to `aux.ecmwf.int` on port 21 + passive range (typically 1024–65535).
4. **Blob Storage mount** — Mount a Blob container at `DATA_CACHE_DIR` via the pool's `mountConfiguration`. The pipeline loads only one GloFAS file at a time, so peak working storage is ~600 MB–1 GB. Blob Storage is used as the working cache for downloads and country splits, and it persists data across retries.
5. **Container entrypoint** — The Batch task command mirrors local invocation, e.g.: `uv run python -m pipelines.infra.run_forecasts --hazard floods`
6. **Pipeline config files** — The YAML configs (`pipelines/infra/configs/*.yaml`) are baked into the Docker image. Adding a new country or changing data sources requires a new image build+push.

## Key Vault Secrets

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
