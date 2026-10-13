#!/usr/bin/env bash
#
# build-and-push-image.sh — Build the pipeline Docker image and push it to ACR.
#
# Deploy step. Rerun on every image change (dependency, config or pipeline code
# change), or use the publish_pipeline_docker_image workflow.
#
# Builds from data/pipelines/deploy/Dockerfile with the data/ directory as build
# context and pushes commit and latest tags to nrwdockerregistry.azurecr.io/pipelines.
# Production promotes an existing commit image to prod without rebuilding it. The YAML
# configs under pipelines/infra/configs/ are baked into the image, so adding a
# country or changing data sources requires a new build+push.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights to push to the ACR.
#   - Docker running locally.
#
# Usage:
#   ./build-and-push-image.sh [test]
#   ./build-and-push-image.sh production <full-commit-sha>

set -euo pipefail

ACR_NAME="nrwdockerregistry"
IMAGE_REPOSITORY="nrwdockerregistry.azurecr.io/pipelines"
TARGET_ENVIRONMENT="${1:-test}"
COMMIT_SHA="${2:-}"
BUILD_CONTEXT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKERFILE="$(cd "$(dirname "$0")" && pwd)/Dockerfile"

if [[ $# -gt 2 || ( "${TARGET_ENVIRONMENT}" != "test" && "${TARGET_ENVIRONMENT}" != "production" ) ]]; then
  echo "Usage: $0 [test|production] [full-commit-sha]" >&2
  exit 1
fi

if [[ "${TARGET_ENVIRONMENT}" == "production" && -z "${COMMIT_SHA}" ]]; then
  echo "Production promotion requires the full commit SHA of an existing image." >&2
  exit 1
fi

if [[ "${TARGET_ENVIRONMENT}" == "test" ]]; then
  BUILD_COMMIT_SHA="${GITHUB_SHA:-$(git -C "${BUILD_CONTEXT}" rev-parse HEAD)}"
  if [[ -n "${COMMIT_SHA}" && "${COMMIT_SHA}" != "${BUILD_COMMIT_SHA}" ]]; then
    echo "The test image commit SHA must match the checked-out commit '${BUILD_COMMIT_SHA}'." >&2
    exit 1
  fi
  COMMIT_SHA="${BUILD_COMMIT_SHA}"
fi

if [[ ! "${COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character Git commit SHA." >&2
  exit 1
fi

COMMIT_IMAGE="${IMAGE_REPOSITORY}:${COMMIT_SHA}"

echo "Logging in to ACR '${ACR_NAME}'."
az acr login --name "${ACR_NAME}" --output none

if [[ "${TARGET_ENVIRONMENT}" == "production" ]]; then
  PRODUCTION_IMAGE="${IMAGE_REPOSITORY}:prod"
  echo "Promoting '${COMMIT_IMAGE}' to '${PRODUCTION_IMAGE}'."
  docker pull --platform linux/amd64 "${COMMIT_IMAGE}"
  docker tag "${COMMIT_IMAGE}" "${PRODUCTION_IMAGE}"
  docker push "${PRODUCTION_IMAGE}"
  echo "Done. Image '${PRODUCTION_IMAGE}' pushed to ACR '${ACR_NAME}'."
  exit 0
fi

if [[ ! -f "${DOCKERFILE}" ]]; then
  echo "Dockerfile not found: ${DOCKERFILE}" >&2
  exit 1
fi

# Batch nodes are amd64; pin the platform so arm64 build hosts (e.g. Apple Silicon) still produce a runnable image.
LATEST_IMAGE="${IMAGE_REPOSITORY}:latest"
echo "Building image '${COMMIT_IMAGE}' from '${DOCKERFILE}' (context '${BUILD_CONTEXT}')."
docker build \
  --platform linux/amd64 \
  --file "${DOCKERFILE}" \
  --tag "${COMMIT_IMAGE}" \
  --tag "${LATEST_IMAGE}" \
  "${BUILD_CONTEXT}"

echo "Pushing images '${COMMIT_IMAGE}' and '${LATEST_IMAGE}'."
docker push "${COMMIT_IMAGE}"
docker push "${LATEST_IMAGE}"

echo "Done. Images '${COMMIT_IMAGE}' and '${LATEST_IMAGE}' pushed to ACR '${ACR_NAME}'."
