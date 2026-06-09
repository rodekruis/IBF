#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/ibf/services/api-service" && npm run lint
