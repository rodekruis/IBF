#!/usr/bin/env bash
#
# apply-lifecycle.sh — Apply the Blob Storage retention policy to the pipeline
# data cache storage account.
#
# One-time setup script. Idempotent — rerun only when the retention rules in
# blob-lifecycle-policy.json change.
#
# The policy expires global GloFAS downloads under glofas/raw/ after 30 days.
# Country-split data (glofas/country_split/ and glofas/country_split_alert/) is
# retained indefinitely, so no rule is defined for those prefixes.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights to manage the storage
#     account's management policy.
#
# Usage:
#   ./apply-lifecycle.sh

set -euo pipefail

RESOURCE_GROUP="nrw-batch-poc"
STORAGE_ACCOUNT="nrwbatchpoc"
POLICY_FILE="$(dirname "$0")/blob-lifecycle-policy.json"

if [[ ! -f "${POLICY_FILE}" ]]; then
  echo "Policy file not found: ${POLICY_FILE}" >&2
  exit 1
fi

echo "Applying Blob lifecycle policy to storage account '${STORAGE_ACCOUNT}'."

az storage account management-policy create \
  --account-name "${STORAGE_ACCOUNT}" \
  --resource-group "${RESOURCE_GROUP}" \
  --policy "@${POLICY_FILE}" \
  --output none

echo "Done. Lifecycle policy applied from '${POLICY_FILE}'."
