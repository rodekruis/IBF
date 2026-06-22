#!/usr/bin/env bash
# One-shot local deploy of the nrw pipelines to Azure (test environment).
#
# Idempotent: re-running updates the existing resources rather than recreating.
#
# Prerequisites: az CLI logged in (`az login`). The image is built in the cloud
# via `az acr build`, so a local Docker daemon is not required.
# See deploy/pipelines_deploy.md for full instructions.

# TODO: When adding blob-upload code to the pipelines, use
#   DefaultAzureCredential (managed identity in Azure, `az login` for local
#   dev) and the BLOB_ACCOUNT_NAME / BLOB_CONTAINER_{30D,90D,PERMANENT} env
#   vars injected by the job below. Shared-key auth is disabled on this
#   storage account.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONFIG_FILE="${SCRIPT_DIR}/config.test.env"
# shellcheck source=config.test.env
source "$CONFIG_FILE"

log() { printf '\n=== %s ===\n' "$*"; }

# Tags applied to every resource we create (space-separated key=value pairs).
TAGS=(
  "project=${TAG_PROJECT}"
  "environment=${TAG_ENV}"
  "owner=${TAG_OWNER}"
  "managed-by=${TAG_MANAGED_BY}"
)

# ---------------------------------------------------------------------------
# 0. Sanity checks
# ---------------------------------------------------------------------------
command -v az >/dev/null || { echo "az CLI not found"; exit 1; }

if [[ ! -f "${DATA_DIR}/${ENV_FILE}" ]]; then
  echo "error: ${DATA_DIR}/${ENV_FILE} not found. Copy .env.example to .env first." >&2
  exit 1
fi

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
echo "Using subscription: $SUBSCRIPTION_ID"

az provider register --namespace Microsoft.App --wait >/dev/null
az provider register --namespace Microsoft.OperationalInsights --wait >/dev/null
az provider register --namespace Microsoft.ContainerRegistry --wait >/dev/null
az provider register --namespace Microsoft.Insights --wait >/dev/null
az provider register --namespace Microsoft.Storage --wait >/dev/null

# ---------------------------------------------------------------------------
# 1. Resource group
# ---------------------------------------------------------------------------
log "Resource group: $RESOURCE_GROUP"
az group create -n "$RESOURCE_GROUP" -l "$AZURE_LOCATION" --tags "${TAGS[@]}" -o none

# ---------------------------------------------------------------------------
# 1b. Storage account + blob containers + lifecycle policy
# ---------------------------------------------------------------------------
log "Storage account: $STORAGE_ACCOUNT_NAME"
az storage account create \
  -g "$RESOURCE_GROUP" -n "$STORAGE_ACCOUNT_NAME" -l "$AZURE_LOCATION" \
  --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --allow-shared-key-access false \
  --default-action Allow \
  --tags "${TAGS[@]}" -o none

STORAGE_ACCOUNT_ID="$(az storage account show \
  -g "$RESOURCE_GROUP" -n "$STORAGE_ACCOUNT_NAME" --query id -o tsv)"

# Containers use Azure AD auth (shared keys are disabled above).
for container in "$BLOB_CONTAINER_30D" "$BLOB_CONTAINER_90D" "$BLOB_CONTAINER_PERMANENT"; do
  log "Blob container: $container"
  az storage container create \
    --account-name "$STORAGE_ACCOUNT_NAME" \
    --name "$container" \
    --auth-mode login \
    --public-access off \
    -o none
done

# Lifecycle policy: delete blobs in the 30d / 90d containers after their
# retention window. The "permanent" container has no rule, so blobs there are
# never auto-deleted.
log "Lifecycle management policy"
LIFECYCLE_POLICY_JSON=$(cat <<JSON
{
  "rules": [
    {
      "enabled": true,
      "name": "delete-after-30d",
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob", "appendBlob"],
          "prefixMatch": ["${BLOB_CONTAINER_30D}/"]
        },
        "actions": {
          "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 30 } }
        }
      }
    },
    {
      "enabled": true,
      "name": "delete-after-90d",
      "type": "Lifecycle",
      "definition": {
        "filters": {
          "blobTypes": ["blockBlob", "appendBlob"],
          "prefixMatch": ["${BLOB_CONTAINER_90D}/"]
        },
        "actions": {
          "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 90 } }
        }
      }
    }
  ]
}
JSON
)
az storage account management-policy create \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --policy "$LIFECYCLE_POLICY_JSON" \
  -o none

# Optional: grant a user/group data-plane read access (portal blob browsing
# requires a data-plane role; subscription Reader alone is not enough).
if [[ -n "${BLOB_DATA_READER_PRINCIPAL_ID:-}" ]]; then
  log "Granting Storage Blob Data Reader to $BLOB_DATA_READER_PRINCIPAL_ID"
  az role assignment create \
    --assignee "$BLOB_DATA_READER_PRINCIPAL_ID" \
    --role "Storage Blob Data Reader" \
    --scope "$STORAGE_ACCOUNT_ID" \
    -o none 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 2. Log Analytics workspace
# ---------------------------------------------------------------------------
log "Log Analytics workspace: $LOG_ANALYTICS_NAME"
az monitor log-analytics workspace create \
  -g "$RESOURCE_GROUP" -n "$LOG_ANALYTICS_NAME" -l "$AZURE_LOCATION" \
  --tags "${TAGS[@]}" -o none

LAW_ID="$(az monitor log-analytics workspace show \
  -g "$RESOURCE_GROUP" -n "$LOG_ANALYTICS_NAME" --query id -o tsv)"
LAW_CUSTOMER_ID="$(az monitor log-analytics workspace show \
  -g "$RESOURCE_GROUP" -n "$LOG_ANALYTICS_NAME" --query customerId -o tsv)"
LAW_KEY="$(az monitor log-analytics workspace get-shared-keys \
  -g "$RESOURCE_GROUP" -n "$LOG_ANALYTICS_NAME" --query primarySharedKey -o tsv)"

# ---------------------------------------------------------------------------
# 3. Azure Container Registry
# ---------------------------------------------------------------------------
log "Azure Container Registry: $ACR_NAME"
az acr create \
  -g "$RESOURCE_GROUP" -n "$ACR_NAME" --sku Basic --admin-enabled false \
  --tags "${TAGS[@]}" -o none

ACR_LOGIN_SERVER="$(az acr show -n "$ACR_NAME" --query loginServer -o tsv)"

# ---------------------------------------------------------------------------
# 4. Build + push image (uses ACR build so no local arch concerns)
# ---------------------------------------------------------------------------
log "Build and push image: ${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}"
az acr build \
  -r "$ACR_NAME" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "${DATA_DIR}/Dockerfile" \
  "${DATA_DIR}"

# ---------------------------------------------------------------------------
# 5. Container Apps environment
# ---------------------------------------------------------------------------
log "Container Apps environment: $CONTAINER_APPS_ENV"
az containerapp env create \
  -g "$RESOURCE_GROUP" -n "$CONTAINER_APPS_ENV" -l "$AZURE_LOCATION" \
  --logs-workspace-id "$LAW_CUSTOMER_ID" \
  --logs-workspace-key "$LAW_KEY" \
  --tags "${TAGS[@]}" -o none

# ---------------------------------------------------------------------------
# 6. Parse .env into secret/env arguments
# ---------------------------------------------------------------------------
log "Parse $ENV_FILE into Container Apps secrets"
eval "$("${SCRIPT_DIR}/parse-env.sh" "${DATA_DIR}/${ENV_FILE}")"
# After eval: $SECRETS holds "k1=v1 k2=v2 ...", $ENV_REFS holds "K1=secretref:k1 ..."

# ---------------------------------------------------------------------------
# 7. Create / update the two scheduled jobs
# ---------------------------------------------------------------------------
create_or_update_job() {
  local job_name="$1"
  local cron="$2"
  local config_path="$3"
  local run_target="$4"

  log "Job: $job_name  (cron='$cron')"

  local exists
  exists="$(az containerapp job show -g "$RESOURCE_GROUP" -n "$job_name" \
    --query name -o tsv 2>/dev/null || true)"

  # shellcheck disable=SC2086
  if [[ -z "$exists" ]]; then
    az containerapp job create \
      -g "$RESOURCE_GROUP" -n "$job_name" \
      --environment "$CONTAINER_APPS_ENV" \
      --trigger-type Schedule \
      --cron-expression "$cron" \
      --replica-timeout "$REPLICA_TIMEOUT_SECONDS" \
      --replica-retry-limit "$REPLICA_RETRY_LIMIT" \
      --parallelism 1 \
      --replica-completion-count 1 \
      --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" \
      --cpu "$CPU" --memory "$MEMORY" \
      --mi-system-assigned \
      --registry-server "$ACR_LOGIN_SERVER" \
      --registry-identity system \
      --secrets $SECRETS \
      --env-vars $ENV_REFS PIPELINE_CONFIG="${config_path}" PIPELINE_RUN_TARGET="${run_target}" \
        BLOB_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME}" \
        BLOB_CONTAINER_30D="${BLOB_CONTAINER_30D}" \
        BLOB_CONTAINER_90D="${BLOB_CONTAINER_90D}" \
        BLOB_CONTAINER_PERMANENT="${BLOB_CONTAINER_PERMANENT}" \
      --tags "${TAGS[@]}" \
      -o none
  else
    az containerapp job update \
      -g "$RESOURCE_GROUP" -n "$job_name" \
      --cron-expression "$cron" \
      --replica-timeout "$REPLICA_TIMEOUT_SECONDS" \
      --replica-retry-limit "$REPLICA_RETRY_LIMIT" \
      --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}" \
      --cpu "$CPU" --memory "$MEMORY" \
      --set-env-vars $ENV_REFS PIPELINE_CONFIG="${config_path}" PIPELINE_RUN_TARGET="${run_target}" \
        BLOB_ACCOUNT_NAME="${STORAGE_ACCOUNT_NAME}" \
        BLOB_CONTAINER_30D="${BLOB_CONTAINER_30D}" \
        BLOB_CONTAINER_90D="${BLOB_CONTAINER_90D}" \
        BLOB_CONTAINER_PERMANENT="${BLOB_CONTAINER_PERMANENT}" \
      -o none
    az containerapp job secret set \
      -g "$RESOURCE_GROUP" -n "$job_name" \
      --secrets $SECRETS -o none
    az containerapp job registry set \
      -g "$RESOURCE_GROUP" -n "$job_name" \
      --server "$ACR_LOGIN_SERVER" --identity system -o none
  fi

  # Ensure the job's managed identity can pull from ACR.
  local principal_id
  principal_id="$(az containerapp job show -g "$RESOURCE_GROUP" -n "$job_name" \
    --query identity.principalId -o tsv)"
  local acr_id
  acr_id="$(az acr show -n "$ACR_NAME" --query id -o tsv)"
  az role assignment create \
    --assignee "$principal_id" \
    --role AcrPull \
    --scope "$acr_id" \
    -o none 2>/dev/null || true

  # And the right to read/write blobs in the storage account.
  az role assignment create \
    --assignee "$principal_id" \
    --role "Storage Blob Data Contributor" \
    --scope "$STORAGE_ACCOUNT_ID" \
    -o none 2>/dev/null || true
}

create_or_update_job "nrw-pipeline-drought" "$DROUGHT_CRON" \
  "pipelines/infra/configs/drought.yaml" "$DROUGHT_RUN_TARGET"
create_or_update_job "nrw-pipeline-floods"  "$FLOODS_CRON"  \
  "pipelines/infra/configs/floods.yaml"  "$FLOODS_RUN_TARGET"

# ---------------------------------------------------------------------------
# 8. Action group (email)
# ---------------------------------------------------------------------------
log "Action group: $ACTION_GROUP_NAME -> $ALERT_EMAIL"
az monitor action-group create \
  -g "$RESOURCE_GROUP" -n "$ACTION_GROUP_NAME" \
  --short-name "$ACTION_GROUP_SHORT" \
  --action email ehill "$ALERT_EMAIL" \
  --tags "${TAGS[@]}" -o none

ACTION_GROUP_ID="$(az monitor action-group show \
  -g "$RESOURCE_GROUP" -n "$ACTION_GROUP_NAME" --query id -o tsv)"

# ---------------------------------------------------------------------------
# 9. Failure alert (scheduled-query log alert)
# ---------------------------------------------------------------------------
log "Log alert rule: $ALERT_RULE_NAME"
ALERT_QUERY="ContainerAppSystemLogs_CL | where ContainerAppName_s startswith 'nrw-pipeline-' | where Reason_s in ('ExecutionFailed','JobFailed','RetriesExhausted','BackOffLimitExceeded')"

az monitor scheduled-query create \
  -g "$RESOURCE_GROUP" -n "$ALERT_RULE_NAME" \
  --scopes "$LAW_ID" \
  --condition "count 'Failures' > 0" \
  --condition-query Failures="$ALERT_QUERY" \
  --evaluation-frequency 15m \
  --window-size 30m \
  --severity 2 \
  --description "An nrw pipeline Container Apps Job execution failed." \
  --action-groups "$ACTION_GROUP_ID" \
  --tags "${TAGS[@]}" \
  -o none || \
az monitor scheduled-query update \
  -g "$RESOURCE_GROUP" -n "$ALERT_RULE_NAME" \
  --condition "count 'Failures' > 0" \
  --condition-query Failures="$ALERT_QUERY" \
  --action-groups "$ACTION_GROUP_ID" \
  -o none

log "Done. Trigger a manual run with:"
echo "  az containerapp job start -g $RESOURCE_GROUP -n nrw-pipeline-drought"
echo "  az containerapp job start -g $RESOURCE_GROUP -n nrw-pipeline-floods"
