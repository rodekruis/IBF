#!/bin/bash
set -Eeuo pipefail

listening() {
    echo "for more results use sudo"
    if [[ $# -eq 0 ]]; then
        lsof -iTCP -sTCP:LISTEN -n -P
    elif [[ $# -eq 1 ]]; then
        lsof -iTCP -sTCP:LISTEN -n -P | grep -i --color "$1"
    else
        echo "Usage: listening [pattern]"
    fi
}

# If port 3000 is in use: say so.
if lsof -iTCP:3000 -sTCP:LISTEN -n -P | grep -q "LISTEN"; then
    echo "Port 3000 is already in use. Please free it before starting the frontend."
    listening 3000
    exit 1
fi

cd go-web-app
pnpm start
