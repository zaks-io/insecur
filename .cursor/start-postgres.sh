#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo /usr/bin/bash /workspaces/insecur/.cursor/start-postgres.sh" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_root}/.env.local"

if [ ! -f "$env_file" ]; then
  echo "Missing ${env_file}; run pnpm dev:db:env first" >&2
  exit 1
fi

load_env_value() {
  local name="$1"
  local value
  value="$(awk -F= -v key="$name" '$1 == key { value = substr($0, length(key) + 2) } END { print value }' "$env_file")"
  export "$name=$value"
}

required_vars=(
  INSECUR_POSTGRES_PORT
  INSECUR_POSTGRES_DB
  INSECUR_POSTGRES_SUPERUSER
  INSECUR_POSTGRES_SUPERUSER_PASSWORD
  INSECUR_POSTGRES_MIGRATION_ROLE
  INSECUR_POSTGRES_MIGRATION_PASSWORD
  INSECUR_POSTGRES_RUNTIME_ROLE
  INSECUR_POSTGRES_RUNTIME_PASSWORD
)

for name in "${required_vars[@]}"; do
  load_env_value "$name"
  if [ -z "${!name:-}" ]; then
    echo "Missing required local Postgres variable: ${name}" >&2
    exit 1
  fi
done

pg_conftool 17 main set port "$INSECUR_POSTGRES_PORT"
pg_conftool 17 main set listen_addresses "localhost"
pg_conftool 17 main set password_encryption "scram-sha-256"
pg_conftool 17 main set idle_in_transaction_session_timeout "300000"
pg_conftool 17 main set max_connections "112"

hba_file="/etc/postgresql/17/main/pg_hba.conf"
if ! grep -q "BEGIN INSECUR cursor local postgres" "$hba_file"; then
  temp_hba="$(mktemp)"
  {
    echo "# BEGIN INSECUR cursor local postgres"
    echo "host all all 127.0.0.1/32 scram-sha-256"
    echo "host all all ::1/128 scram-sha-256"
    echo "# END INSECUR cursor local postgres"
    cat "$hba_file"
  } > "$temp_hba"
  cat "$temp_hba" > "$hba_file"
  rm "$temp_hba"
fi

if pg_ctlcluster 17 main status >/dev/null 2>&1; then
  pg_ctlcluster 17 main restart
else
  pg_ctlcluster 17 main start
fi

for _ in {1..20}; do
  if pg_isready -h 127.0.0.1 -p "$INSECUR_POSTGRES_PORT" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! pg_isready -h 127.0.0.1 -p "$INSECUR_POSTGRES_PORT" -d postgres >/dev/null 2>&1; then
  echo "Postgres did not become ready on 127.0.0.1:${INSECUR_POSTGRES_PORT}" >&2
  exit 1
fi

sudo -u postgres psql \
  --dbname postgres \
  --set=ON_ERROR_STOP=1 \
  --set=superuser_role="$INSECUR_POSTGRES_SUPERUSER" \
  --set=superuser_password="$INSECUR_POSTGRES_SUPERUSER_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L SUPERUSER CREATEDB CREATEROLE', :'superuser_role', :'superuser_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'superuser_role')\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L SUPERUSER CREATEDB CREATEROLE', :'superuser_role', :'superuser_password')\gexec
SQL

sudo -u postgres psql \
  --dbname postgres \
  --set=ON_ERROR_STOP=1 \
  --set=db_name="$INSECUR_POSTGRES_DB" <<'SQL'
SELECT format('CREATE DATABASE %I', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')\gexec
SQL

sudo -u postgres env \
  POSTGRES_USER=postgres \
  POSTGRES_DB="$INSECUR_POSTGRES_DB" \
  INSECUR_POSTGRES_DB="$INSECUR_POSTGRES_DB" \
  INSECUR_POSTGRES_MIGRATION_ROLE="$INSECUR_POSTGRES_MIGRATION_ROLE" \
  INSECUR_POSTGRES_MIGRATION_PASSWORD="$INSECUR_POSTGRES_MIGRATION_PASSWORD" \
  INSECUR_POSTGRES_RUNTIME_ROLE="$INSECUR_POSTGRES_RUNTIME_ROLE" \
  INSECUR_POSTGRES_RUNTIME_PASSWORD="$INSECUR_POSTGRES_RUNTIME_PASSWORD" \
  bash "${repo_root}/infra/postgres/init/001-local-roles.sh"

sudo -u postgres env \
  POSTGRES_USER=postgres \
  INSECUR_POSTGRES_DB="$INSECUR_POSTGRES_DB" \
  INSECUR_POSTGRES_MIGRATION_ROLE="$INSECUR_POSTGRES_MIGRATION_ROLE" \
  INSECUR_POSTGRES_RUNTIME_ROLE="$INSECUR_POSTGRES_RUNTIME_ROLE" \
  INSECUR_POSTGRES_RUNTIME_PASSWORD="$INSECUR_POSTGRES_RUNTIME_PASSWORD" \
  INSECUR_POSTGRES_INTERNAL_PORT="$INSECUR_POSTGRES_PORT" \
  sh "${repo_root}/infra/postgres/check-runtime-role.sh"

echo "OK Cursor Postgres service is ready on 127.0.0.1:${INSECUR_POSTGRES_PORT}"
