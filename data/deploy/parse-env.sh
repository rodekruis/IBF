#!/usr/bin/env bash
# Parse a .env file and emit, on stdout, two lines:
#   SECRETS="key1=val1 key2=val2 ..."
#   ENV_REFS="ORIGINAL_KEY1=secretref:key1 ORIGINAL_KEY2=secretref:key2 ..."
#
# Azure Container Apps secret names must be lowercase alphanumerics + dashes,
# so each .env key is lowercased and underscores become dashes.
#
# Lines starting with '#' and blank lines are ignored. Quoted values are unwrapped.

set -euo pipefail

ENV_FILE="${1:?usage: parse-env.sh <path-to-.env>}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: env file not found: $ENV_FILE" >&2
  exit 1
fi

secrets=()
env_refs=()

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="${raw_line%$'\r'}"
  # strip leading/trailing whitespace
  line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [[ -z "$line" || "$line" == \#* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # unwrap matching surrounding quotes
  if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  # secret name: lowercase, underscores -> dashes
  secret_name="$(printf '%s' "$key" | tr '[:upper:]_' '[:lower:]-')"

  secrets+=("${secret_name}=${value}")
  env_refs+=("${key}=secretref:${secret_name}")
done < "$ENV_FILE"

printf 'SECRETS=%q\n' "${secrets[*]}"
printf 'ENV_REFS=%q\n' "${env_refs[*]}"
