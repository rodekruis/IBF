#!/bin/bash
#
# Drops and recreates the api-service DB schema, restarts services, then seeds
# base data and mock events for MWI. Use when migrations get out of sync or the
# DB is in a broken state.
#
set -Eeuo pipefail

print_header() {
    local title="$1"
    local width=60
    local title_length=${#title}
    local padding=$(( (width - title_length - 2) / 2 ))

    echo ""
    printf "%${width}s\n" | tr ' ' '='
    printf "%${padding}s%s%${padding}s\n" "" "${title}" ""
    printf "%${width}s\n" | tr ' ' '='
    echo ""
}

DB_NAME="ibf"
DB_PORT="5436"
DB_USER="ibf"
SCHEMA="api-service"

if [[ -f "services/.env" ]]; then
    ENV_FILE="services/.env"
elif [[ -f "IBF/services/.env" ]]; then
    ENV_FILE="IBF/services/.env"
else
    echo "Error: Cannot find services/.env. Run this script from the IBF repo root or from the directory containing IBF/."
    exit 1
fi

DB_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)
if [[ -z "${DB_PASSWORD}" ]]; then
    echo "Error: POSTGRES_PASSWORD not found in ${ENV_FILE}"
    exit 1
fi

print_header "Dropping and recreating schema"

PGPASSWORD="${DB_PASSWORD}" psql -U "${DB_USER}" -h localhost -p "${DB_PORT}" -d "${DB_NAME}" -c "DROP SCHEMA IF EXISTS \"${SCHEMA}\" CASCADE;"
PGPASSWORD="${DB_PASSWORD}" psql -U "${DB_USER}" -h localhost -p "${DB_PORT}" -d "${DB_NAME}" -c "CREATE SCHEMA \"${SCHEMA}\";"

print_header "Restarting services"

docker restart api-service
docker restart pg_featureserv

print_header "Waiting for api-service to be ready"

until curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/health | grep -q '200'; do
    sleep 1
done
echo "✅ api-service is ready"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/initial_setup/sub_scripts/backend_reset_and_seed.sh"

print_header "Done"
