#!/bin/bash
set -euo pipefail

required_vars=(
  INSECUR_POSTGRES_DB
  INSECUR_POSTGRES_MIGRATION_ROLE
  INSECUR_POSTGRES_MIGRATION_PASSWORD
  INSECUR_POSTGRES_RUNTIME_ROLE
  INSECUR_POSTGRES_RUNTIME_PASSWORD
)

for name in "${required_vars[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "Missing required local Postgres variable: ${name}" >&2
    exit 1
  fi
done

psql \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --set=ON_ERROR_STOP=1 \
  --set=db_name="${INSECUR_POSTGRES_DB}" \
  --set=migration_role="${INSECUR_POSTGRES_MIGRATION_ROLE}" \
  --set=migration_password="${INSECUR_POSTGRES_MIGRATION_PASSWORD}" \
  --set=runtime_role="${INSECUR_POSTGRES_RUNTIME_ROLE}" \
  --set=runtime_password="${INSECUR_POSTGRES_RUNTIME_PASSWORD}" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'migration_role',
  :'migration_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migration_role')\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'migration_role',
  :'migration_password'
)\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'runtime_role',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role')\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'runtime_role',
  :'runtime_password'
)\gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'db_name')\gexec
SELECT format('GRANT CONNECT, TEMPORARY, CREATE ON DATABASE %I TO %I', :'db_name', :'migration_role')\gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', :'db_name', :'runtime_role')\gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_role')\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_role')\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'migration_role',
  :'runtime_role'
)\gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
  :'migration_role',
  :'runtime_role'
)\gexec
SQL
