#!/usr/bin/env bash
#
# build-and-push-image.sh — Build the pipeline Docker image and push it to ACR.
#
# Deploy step. Rerun on every image change (dependency, config or pipeline code
# change), or use the publish_pipeline_docker_image workflow.
#
# Builds and pushes commit and latest tags for test. Staging and production
# promote an already-published commit image to their environment tag.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights to push to the ACR.
#   - Docker running locally.
#
# Usage:
#   ./build-and-push-image.sh [test|staging|production]

set -euo pipefail

ACR_NAME="nrwdockerregistry"
IMAGE_REPOSITORY="pipelines"
TARGET_ENVIRONMENT="${1:-test}"
BUILD_CONTEXT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKERFILE="$(cd "$(dirname "$0")" && pwd)/Dockerfile"

echo "Logging in to ACR '${ACR_NAME}'."
az acr login --name "${ACR_NAME}" --output none

# Build and push the image if the environment is 'test'. Otherwise, promote the image to the target environment.
case "${TARGET_ENVIRONMENT}" in
  test)
    if [[ ! -f "${DOCKERFILE}" ]]; then
      echo "Dockerfile not found: ${DOCKERFILE}" >&2
      exit 1
    fi

    # Batch nodes are amd64; pin the platform so arm64 build hosts (e.g. Apple Silicon) still produce a runnable image.
    echo "Building image '${IMAGE_REPOSITORY}:latest' from '${DOCKERFILE}' (context '${BUILD_CONTEXT}')."
    docker build \
      --platform linux/amd64 \
      --file "${DOCKERFILE}" \
      --tag "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:latest" \
      "${BUILD_CONTEXT}"
    docker push "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:latest"
    echo "Image ${IMAGE_REPOSITORY}:latest pushed to ACR '${ACR_NAME}'."
    ;;
  staging)
    az acr import \
    --name "${ACR_NAME}" \
    --source "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:latest" \
    --image "${IMAGE_REPOSITORY}:staging" \
    --force
    echo "Image ${IMAGE_REPOSITORY}:latest promoted to staging."
    ;;
  production)
    az acr import \
    --name "${ACR_NAME}" \
    --source "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:staging" \
    --image "${IMAGE_REPOSITORY}:production" \
    --force
    echo "Image ${IMAGE_REPOSITORY}:staging promoted to production."
    ;;
  *)
    echo "Invalid target environment: ${TARGET_ENVIRONMENT}" >&2
    exit 1
    ;;
esac
