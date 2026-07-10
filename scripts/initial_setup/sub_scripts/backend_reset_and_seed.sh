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

print_header "Checking backend is running"

if ! curl --silent --fail 'http://localhost:4000/api/instance/health' > /dev/null; then
    echo "Error: Backend is not running or not healthy at http://localhost:4000"
    echo "Please start the backend first using backend_start.sh"
    exit 1
fi
echo "✅ Backend is running"

print_header "Resetting IBF instance"

curl --silent --show-error --fail -X 'POST' \
  'http://localhost:4000/api/seed/reset?countryCodes=MWI' \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"secret":"fill_in_secret"}' \
  > /dev/null

print_header "Creating mock events"

curl --silent --show-error --fail -X 'POST' \
  'http://localhost:4000/api/seed/mock-events?countryCodeIso3=MWI&scenario=events' \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{"secret":"fill_in_secret"}' \
  > /dev/null

print_header "Done"
