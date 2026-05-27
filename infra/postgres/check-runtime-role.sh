#!/bin/sh
set -eu

fail() {
  echo "FAIL $1" >&2
  exit 1
}

require_identifier() {
  value="$1"
  label="$2"
  case "$value" in
    "" | *[!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_]*)
      fail "${label} must use only letters, numbers, and underscores"
      ;;
  esac
}

require_identifier "$INSECUR_POSTGRES_DB" "INSECUR_POSTGRES_DB"
require_identifier "$INSECUR_POSTGRES_MIGRATION_ROLE" "INSECUR_POSTGRES_MIGRATION_ROLE"
require_identifier "$INSECUR_POSTGRES_RUNTIME_ROLE" "INSECUR_POSTGRES_RUNTIME_ROLE"

if [ "$INSECUR_POSTGRES_RUNTIME_ROLE" = "$INSECUR_POSTGRES_MIGRATION_ROLE" ]; then
  fail "runtime and migration roles must be distinct"
fi

runtime_bypass="$(
  psql -U "$POSTGRES_USER" -d "$INSECUR_POSTGRES_DB" -Atc \
    "SELECT rolbypassrls FROM pg_roles WHERE rolname = '$INSECUR_POSTGRES_RUNTIME_ROLE';"
)"

if [ "$runtime_bypass" != "f" ]; then
  fail "runtime role rolbypassrls must be false"
fi

runtime_user="$(
  PGPASSWORD="$INSECUR_POSTGRES_RUNTIME_PASSWORD" psql \
    -h 127.0.0.1 \
    -p 5432 \
    -U "$INSECUR_POSTGRES_RUNTIME_ROLE" \
    -d "$INSECUR_POSTGRES_DB" \
    -Atc "SELECT current_user;"
)"

if [ "$runtime_user" != "$INSECUR_POSTGRES_RUNTIME_ROLE" ]; then
  fail "runtime role could not connect as itself"
fi

password_encryption="$(
  psql -U "$POSTGRES_USER" -d "$INSECUR_POSTGRES_DB" -Atc "SHOW password_encryption;"
)"

if [ "$password_encryption" != "scram-sha-256" ]; then
  fail "password_encryption must be scram-sha-256"
fi

idle_timeout="$(
  psql -U "$POSTGRES_USER" -d "$INSECUR_POSTGRES_DB" -Atc \
    "SELECT current_setting('idle_in_transaction_session_timeout');"
)"

if [ "$idle_timeout" != "300000" ] && [ "$idle_timeout" != "5min" ]; then
  fail "idle_in_transaction_session_timeout must be 300000"
fi

max_connections="$(
  psql -U "$POSTGRES_USER" -d "$INSECUR_POSTGRES_DB" -Atc "SHOW max_connections;"
)"

if [ "$max_connections" != "112" ]; then
  fail "max_connections must be 112"
fi

echo "OK runtime role is distinct, can connect, rolbypassrls=false, and Neon-adjacent settings match"
