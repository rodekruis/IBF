#!/usr/bin/env bash
#
# build-and-push-image.sh — Build the pipeline Docker image and push it to ACR.
#
# Deploy step. Rerun on every image change (dependency, config or pipeline code
# change). Replaced by CI/CD later.
#
# Builds from data/Dockerfile with the data/ directory as build context and
# pushes to nrwdockerregistry.azurecr.io/pipelines:latest. The YAML configs
# under pipelines/infra/configs/ are baked into the image, so adding a country
# or changing data sources requires a new build+push.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights to push to the ACR.
#   - Docker running locally.
#
# Usage:
#   ./build-and-push-image.sh

set -euo pipefail

ACR_NAME="nrwdockerregistry"
IMAGE="nrwdockerregistry.azurecr.io/pipelines:latest"
BUILD_CONTEXT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="${BUILD_CONTEXT}/Dockerfile"

if [[ ! -f "${DOCKERFILE}" ]]; then
  echo "Dockerfile not found: ${DOCKERFILE}" >&2
  exit 1
fi

echo "Logging in to ACR '${ACR_NAME}'."
az acr login --name "${ACR_NAME}" --output none

echo "Building image '${IMAGE}' from '${DOCKERFILE}' (context '${BUILD_CONTEXT}')."
docker build \
  --file "${DOCKERFILE}" \
  --tag "${IMAGE}" \
  "${BUILD_CONTEXT}"

echo "Pushing image '${IMAGE}'."
docker push "${IMAGE}"

echo "Done. Image '${IMAGE}' pushed to ACR '${ACR_NAME}'."
