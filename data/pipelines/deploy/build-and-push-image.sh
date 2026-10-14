#!/usr/bin/env bash
#
# build-and-push-image.sh — Build the pipeline Docker image and push it to ACR.
#
# Deploy step. Rerun on every image change (dependency, config or pipeline code
# change), or use the publish_pipeline_docker_image workflow.
#
# Builds and pushes commit and environment tags for test and staging. Production
# promotes an already-published staging commit image to the production tag.
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

build_image() {
    local environment_tag="$1"
    if [[ ! -f "${DOCKERFILE}" ]]; then
      echo "Dockerfile not found: ${DOCKERFILE}" >&2
      exit 1
    fi

    # Batch nodes are amd64; pin the platform so arm64 build hosts (e.g. Apple Silicon) still produce a runnable image.
    echo "Building image '${IMAGE_REPOSITORY}:${environment_tag}' from '${DOCKERFILE}' (context '${BUILD_CONTEXT}')."
    docker build \
      --platform linux/amd64 \
      --file "${DOCKERFILE}" \
      --tag "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:${environment_tag}" \
      "${BUILD_CONTEXT}"
    docker push "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:${environment_tag}"
    echo "Image ${IMAGE_REPOSITORY}:${environment_tag} pushed to ACR '${ACR_NAME}'."
}

echo "Logging in to ACR '${ACR_NAME}'."
az acr login --name "${ACR_NAME}" --output none

case "${TARGET_ENVIRONMENT}" in
  test)
    build_image "test"
    ;;
  staging)
    build_image "staging"
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
