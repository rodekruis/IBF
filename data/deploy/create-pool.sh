#!/usr/bin/env bash
#
# create-pool.sh — Create (or recreate) the nrwbatchpoc Batch pool.
#
# Deploy step, only needed if the pool must be recreated. The mountConfiguration
# property can only be set at pool creation time, so any change to the Blob mount
# requires recreating the pool.
#
# Wraps the three commands documented in deploy.md:
#   1. Delete the existing pool (safe when autoscaled to 0 nodes / no jobs).
#   2. Recreate the pool from pool.json (mount, autoscale, VNet, ACR, container).
#   3. Attach the user-assigned managed identity via the management API, which
#      is not supported in the data-plane pool.json.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights on the Batch account and the
#     nrw-batch-poc resource group.
#
# Usage:
#   ./create-pool.sh

set -euo pipefail

SUBSCRIPTION_ID="57b0d17a-5429-4dbb-8366-35c928e3ed94"
RESOURCE_GROUP="nrw-batch-poc"
BATCH_ACCOUNT="nrwbatchpoc"
BATCH_ENDPOINT="nrwbatchpoc.westeurope.batch.azure.com"
POOL_ID="nrwbatchpoc"
MANAGED_IDENTITY="nrw-batch-poc"
POOL_FILE="$(dirname "$0")/pool.json"

if [[ ! -f "${POOL_FILE}" ]]; then
  echo "Pool definition not found: ${POOL_FILE}" >&2
  exit 1
fi

echo "Deleting existing pool '${POOL_ID}' (safe when autoscaled to 0 nodes)."
az batch pool delete \
  --pool-id "${POOL_ID}" \
  --account-name "${BATCH_ACCOUNT}" \
  --account-endpoint "${BATCH_ENDPOINT}" \
  --yes

echo "Recreating pool '${POOL_ID}' from '${POOL_FILE}'."
az batch pool create \
  --json-file "${POOL_FILE}" \
  --account-name "${BATCH_ACCOUNT}" \
  --account-endpoint "${BATCH_ENDPOINT}"

echo "Attaching user-assigned managed identity '${MANAGED_IDENTITY}' to the pool."
IDENTITY_RESOURCE_ID="/subscriptions/${SUBSCRIPTION_ID}/resourcegroups/${RESOURCE_GROUP}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${MANAGED_IDENTITY}"
POOL_MANAGEMENT_URL="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Batch/batchAccounts/${BATCH_ACCOUNT}/pools/${POOL_ID}?api-version=2024-07-01"

az rest \
  --method PATCH \
  --url "${POOL_MANAGEMENT_URL}" \
  --body "{\"identity\":{\"type\":\"UserAssigned\",\"userAssignedIdentities\":{\"${IDENTITY_RESOURCE_ID}\":{}}}}" \
  --output none

echo "Done. Pool '${POOL_ID}' created with managed identity '${MANAGED_IDENTITY}'."
