#!/bin/bash
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

if [[ -f "services/.env" ]]; then
    ENV_FILE="services/.env"
elif [[ -f "IBF/services/.env" ]]; then
    ENV_FILE="IBF/services/.env"
else
    echo "Error: Cannot find services/.env. Run this script from the IBF repo root or from the directory containing IBF/."
    exit 1
fi

RESET_SECRET=$(grep '^RESET_SECRET=' "${ENV_FILE}" | cut -d= -f2- || true)
if [[ -z "${RESET_SECRET}" ]]; then
    echo "Error: RESET_SECRET not found in ${ENV_FILE}"
    exit 1
fi

print_header "Checking backend is running"

if ! curl --silent --fail 'http://localhost:4000/api/health' > /dev/null; then
    echo "Error: Backend is not running or not healthy at http://localhost:4000"
    echo "Please start the backend first using backend_start.sh"
    exit 1
fi
echo "✅ Backend is running"

print_header "Resetting IBF instance"

curl --silent --show-error --fail -X 'POST' \
  'http://localhost:4000/api/reset?countryCodes=MWI' \
  -H 'Content-Type: application/json' \
  -d "{\"secret\": \"${RESET_SECRET}\"}" \
  > /dev/null

echo "Waiting for reset to complete..."
while true; do
  STATUS=$(curl --silent "http://localhost:4000/api/reset/status")
  IN_PROGRESS=$(echo "$STATUS" | jq -r '.inProgress')
  ERROR=$(echo "$STATUS" | jq -r '.error')
  if [ "$IN_PROGRESS" = "false" ]; then
    if [ "$ERROR" != "null" ]; then
      echo "Reset failed: $ERROR"
      exit 1
    fi
    break
  fi
  sleep 1
done
echo "✅ Reset completed"

print_header "Creating mock events"

curl --silent --show-error --fail -X 'POST' \
  'http://localhost:4000/api/mock?countryCodeIso3=MWI&scenario=events' \
  -H 'Content-Type: application/json' \
  -d "{\"secret\": \"${RESET_SECRET}\"}" \
  > /dev/null

print_header "Done"
