#!/usr/bin/env bash
#
# env_helpers.sh — Shared helpers for reading .env values.

# Read a single KEY=value from the env file, stripping surrounding quotes.
read_env_var() {
  local var_name="$1"
  local line
  line="$(grep -E "^[[:space:]]*${var_name}=" "${ENV_FILE}" | tail -n 1)"
  if [[ -z "${line}" ]]; then
    return 1
  fi
  local value="${line#*=}"
  # Strip CR first: a CRLF .env leaves '\r' after the closing quote, which
  # would otherwise survive quote stripping and poison the read value.
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}
