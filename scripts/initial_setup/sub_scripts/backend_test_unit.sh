#!/bin/bash
set -Eeuo pipefail

docker exec api-service npm run test:unit:all "$@"
