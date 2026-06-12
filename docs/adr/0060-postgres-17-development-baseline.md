# ADR-0060: Postgres 17 Development Baseline

Date: 2026-05-27

Status: Accepted

## Decision

Local development, agent environments, and CI database branches use Postgres 17 until Postgres 18 is
no longer preview on Neon. The local Docker Compose scaffold is pinned to `postgres:17-bookworm`,
and migrations and tests must not depend on Postgres 18-only behavior.

This does not change ADR-0036 or ADR-0054: Neon Postgres remains the authoritative production and
CI RLS surface, and tenant-isolation tests still run against real Postgres as the `NOBYPASSRLS`
runtime role. The local database is only an iteration aid for schema, role, migration, and
Tenant-Scoped Store work.

## Options Considered

- **Use Postgres 18 locally because the upstream Docker image is available.** Rejected. Neon lists
  Postgres 18 as preview, so local development would train agents against a newer engine than the
  authoritative Neon path.
- **Use Postgres 17 locally and in Neon-backed branches.** Accepted. It matches the stable Neon
  target while preserving real Postgres Row-Level Security behavior.
- **Use SQLite, PGlite, or D1 for local convenience.** Rejected again here for the same reason as
  ADR-0054: they do not provide the RLS surface under test.

## Consequences

- `compose.yaml` pins the local Postgres service to `postgres:17-bookworm`.
- The local service makes Neon-adjacent configuration explicit for SCRAM host auth,
  `password_encryption`, `idle_in_transaction_session_timeout`, and `max_connections`.
- Schema and migration work should avoid Postgres 18-only syntax or behavior until this ADR is
  intentionally revised.
- When Neon marks Postgres 18 non-preview and the project chooses to upgrade, update this ADR,
  `compose.yaml`, CI branch provisioning, and any version-specific docs in the same change.
- The local guard still proves only role posture, not complete tenant isolation. Authoritative RLS
  tests remain Neon-backed and run through `DATABASE_URL_RUNTIME`.

## Amendment (2026-06-11)

[ADR-0065](0065-test-layers-and-preview-smoke.md) moved `test:rls` execution onto Docker Compose
Postgres 17, locally and in CI's `postgres-integration` job, so the Neon-backed framing above no
longer describes the CI RLS substrate. ADR-0054's `NOBYPASSRLS` runtime-role and
distinct-credential invariants are unchanged, and Neon's remaining test role is the gated preview
smoke only.
