#!/bin/bash
set -Eeuo pipefail

docker exec api-service npm run test:integration:all "$@"
