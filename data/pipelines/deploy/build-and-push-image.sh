#!/usr/bin/env bash
#
# build-and-push-image.sh — Build the pipeline Docker image and push it to ACR.
#
# Deploy step. Rerun on every image change (dependency, config or pipeline code
# change), or use the publish_pipeline_docker_image workflow.
#
# Builds from data/pipelines/deploy/Dockerfile with the data/ directory as build
# context and pushes commit and latest tags to nrwdockerregistry.azurecr.io/pipelines.
# A tag is added to separate test (latest) from production and staging versions of the image.
#
# Prerequisites:
#   - Azure CLI logged in (`az login`) with rights to push to the ACR.
#   - Docker running locally.
#
# Usage:
#   ./build-and-push-image.sh [test]

set -euo pipefail

ACR_NAME="nrwdockerregistry"
IMAGE_REPOSITORY="nrwdockerregistry.azurecr.io/pipelines"
TARGET_ENVIRONMENT="${1:-test}"
BUILD_CONTEXT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKERFILE="$(cd "$(dirname "$0")" && pwd)/Dockerfile"
BUILD_COMMIT_SHA="${GITHUB_SHA:-$(git -C "${BUILD_CONTEXT}" rev-parse HEAD)}"
case "${TARGET_ENVIRONMENT}" in
  test)
    ENV_TAG="latest"
    ;;
  staging)
    ENV_TAG="staging"
    ;;
  production)
    ENV_TAG="production"
    ;;
  *)
    echo "Invalid target environment: ${TARGET_ENVIRONMENT}" >&2
    exit 1
    ;;
esac


if [[ ! "${BUILD_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character Git commit SHA." >&2
  exit 1
fi

COMMIT_IMAGE="${IMAGE_REPOSITORY}:${BUILD_COMMIT_SHA}"

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
ENV_IMAGE="${IMAGE_REPOSITORY}:${ENV_TAG}"
echo "Building image '${COMMIT_IMAGE}' from '${DOCKERFILE}' (context '${BUILD_CONTEXT}')."
docker build \
  --platform linux/amd64 \
  --file "${DOCKERFILE}" \
  --tag "${COMMIT_IMAGE}" \
  --tag "${ENV_IMAGE}" \
  "${BUILD_CONTEXT}"

echo "Pushing images '${COMMIT_IMAGE}' and '${ENV_IMAGE}'."
docker push "${COMMIT_IMAGE}"
docker push "${ENV_IMAGE}"

echo "Done. Images '${COMMIT_IMAGE}' and '${ENV_IMAGE}' pushed to ACR '${ACR_NAME}'."
