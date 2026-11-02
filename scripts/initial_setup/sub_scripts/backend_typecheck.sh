#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/NRW/services/api-service" && npm run typecheck
