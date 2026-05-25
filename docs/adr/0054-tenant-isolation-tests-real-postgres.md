# ADR-0054: Tenant-Isolation Tests Run Against Real Postgres

Date: 2026-05-25
Status: Accepted

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
