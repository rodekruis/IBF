#!/bin/bash
set -Eeuo pipefail

docker exec api-service npm run prisma migrate deploy
