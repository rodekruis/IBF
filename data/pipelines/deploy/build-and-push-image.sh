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
IMAGE_REPOSITORY="${ACR_NAME}.azurecr.io/pipelines"
TARGET_ENVIRONMENT="${1:-test}"
BUILD_CONTEXT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKERFILE="$(cd "$(dirname "$0")" && pwd)/Dockerfile"
BUILD_COMMIT_SHA="${GITHUB_SHA:-$(git -C "${BUILD_CONTEXT}" rev-parse HEAD)}"
if [[ ! "${BUILD_COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character Git commit SHA." >&2
  exit 1
fi
COMMIT_IMAGE="${IMAGE_REPOSITORY}:${BUILD_COMMIT_SHA}"

write_promotion_output() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    printf 'promoted=%s\n' "$1" >> "${GITHUB_OUTPUT}"
  fi
}

promote_image() {
  local environment_image="$1"
  local matching_tag_count

  matching_tag_count="$(az acr repository show-tags \
    --name "${ACR_NAME}" \
    --repository "${IMAGE_REPOSITORY##*/}" \
    --query "[?@=='${BUILD_COMMIT_SHA}'] | length(@)" \
    --output tsv)"

  case "${matching_tag_count}" in
    0)
      echo "No image found for '${COMMIT_IMAGE}'; skipping promotion to '${environment_image}'."
      write_promotion_output false
      return 0
      ;;
    1)
      ;;
    *)
      echo "Unexpected tag count for '${COMMIT_IMAGE}': ${matching_tag_count}" >&2
      return 1
      ;;
  esac

  echo "Promoting '${COMMIT_IMAGE}' to '${environment_image}'."
  az acr import \
    --name "${ACR_NAME}" \
    --source "${COMMIT_IMAGE}" \
    --image "${environment_image}" \
    --force
  write_promotion_output true
  echo "Done. Image '${environment_image}' pushed to ACR '${ACR_NAME}'."
}

echo "Logging in to ACR '${ACR_NAME}'."
az acr login --name "${ACR_NAME}" --output none

# Build and push the image if the environment is 'test'. Otherwise, promote the image to the target environment.
case "${TARGET_ENVIRONMENT}" in
  test)
    if [[ ! -f "${DOCKERFILE}" ]]; then
      echo "Dockerfile not found: ${DOCKERFILE}" >&2
      exit 1
    fi
    ENV_IMAGE="${IMAGE_REPOSITORY}:latest"

    # Batch nodes are amd64; pin the platform so arm64 build hosts (e.g. Apple Silicon) still produce a runnable image.
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
    ;;
  staging)
    STAGING_IMAGE="${IMAGE_REPOSITORY}:staging"
    promote_image "${STAGING_IMAGE}"
    ;;
  production)
    PRODUCTION_IMAGE="${IMAGE_REPOSITORY}:production"
    promote_image "${PRODUCTION_IMAGE}"
    ;;
  *)
    echo "Invalid target environment: ${TARGET_ENVIRONMENT}" >&2
    exit 1
    ;;
esac
