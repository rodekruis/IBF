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
  'http://localhost:4000/api/instance/reset?script=initial-state' \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{
     -d '{"secret":"fill_in_secret"}' \
   > /dev/null
}'

print_header "Running test test/events/events-rich-seed.test.ts to get mock events in database"
# Later we can use dedicated seeding scripts, but for now this is a quick and easy way to get some events in the database.
docker exec api-service npm run test:integration:all test/events/events-rich-seed.test.ts


print_header "Done"
