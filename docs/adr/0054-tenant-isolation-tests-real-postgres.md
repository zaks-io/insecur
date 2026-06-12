# ADR-0054: Tenant-Isolation Tests Run Against Real Postgres

Date: 2026-05-25
Status: Accepted, amended by [ADR-0065](0065-test-layers-and-preview-smoke.md)

Cross-tenant authorization and Row-Level Security regression tests run against a real Postgres, specifically a per-PR Neon branch, and connect as the `NOBYPASSRLS` runtime role through `DATABASE_URL_RUNTIME`. They never run against SQLite or PGlite, and they never connect as the elevated migration role. These tests are the concrete implementation of ADR-0008's required cross-tenant authorization tests, and they exercise the two-layer isolation that ADR-0036 (Neon behind Hyperdrive with RLS) and ADR-0037 (Tenant-Scoped Bound Store over RLS) define. They are wired as the `test:rls` Turbo task with `cache: false`, because the task depends on live database state, and they never execute on forked pull requests, which receive no secret-bearing steps.

Connecting as the migration role, or any role with `BYPASSRLS` or table ownership, silently disables the policy under test and turns the entire suite green while testing nothing. To prevent that, CI asserts that the runtime credential and the migration credential are distinct and fails if they are equal. The runtime role is the same `NOBYPASSRLS` identity the product uses at request time, so the test proves the database itself enforces isolation rather than proving our beliefs about it.

## Considered Options

- **SQLite or PGlite in-memory.** Rejected: neither implements Postgres Row-Level Security, so the suite would pass while the production isolation control stayed untested. This is the exact silent-bypass failure ADR-0036 exists to avoid, and SQLite was already rejected as a product datastore there.
- **Mock the data-access layer.** Rejected: mocks encode our assumptions about isolation instead of the database's enforcement, so they cannot catch a missing or wrong policy.
- **Run the suite as the migration or owner role for setup convenience.** Rejected as non-negotiable: those roles bypass RLS and every cross-tenant assertion would pass vacuously.

## Consequences

- Two distinct CI secrets exist, `DATABASE_URL_RUNTIME` (the `NOBYPASSRLS` role) and the elevated migration URL, and CI must assert they differ before the suite is trusted.
- The suite cannot run on forked pull requests, which is acceptable because fork secret-isolation is a hard rule and the suite re-runs on merge to an internal branch.
- Each pull request provisions a Neon branch for an honest isolation surface; that branching cost is accepted in exchange for testing the real mechanism.

## Amendment (2026-06-11): Postgres substrate moved to Docker Compose per ADR-0065

Per [ADR-0065](0065-test-layers-and-preview-smoke.md) (2026-06-03), the Postgres source for `test:rls` is Docker Compose Postgres 17, both locally and in CI's `postgres-integration` job; the per-PR Neon branch now backs only the gated preview smoke layer (`PREVIEW_ENV_ENABLED`, INS-164). Consequences 2 and 3 above are superseded accordingly: the integration/RLS gate is fork-safe by design because the Docker Compose database carries no repository secrets, so it runs on all pull requests including forks, and no Neon branch is provisioned for it. The invariants stand unchanged: the suite never runs against SQLite or PGlite, it connects as the `NOBYPASSRLS` runtime role through `DATABASE_URL_RUNTIME` and never as the migration role, and CI still asserts that the runtime and migration credentials are distinct before trusting the suite.
