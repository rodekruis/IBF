#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/IBF/services/api-service" && npm run knip
