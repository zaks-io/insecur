# Testing

insecur's tests are organized into three layers by where Postgres comes from and what
failure class each catches. The decision record is [ADR-0065](../adr/0065-test-layers-and-preview-smoke.md).

| Layer             | Postgres              | Runtime                                           | Command                                               | Runs where             |
| ----------------- | --------------------- | ------------------------------------------------- | ----------------------------------------------------- | ---------------------- |
| Unit              | none                  | Node Vitest                                       | `pnpm test`                                           | local, CI, agents      |
| Integration + RLS | Docker Compose        | Node Vitest, real route stack + `postgres` driver | `pnpm dev:db:reset && pnpm test:rls && pnpm test:e2e` | local, CI, agents      |
| Preview smoke     | ephemeral Neon branch | deployed Worker + Hyperdrive                      | `pr-preview.yml` (gated)                              | per-PR CI once enabled |

## For agents

To run the full DB-backed loop with no cloud credentials, only Docker:

```
pnpm dev:db:reset   # Docker Compose Postgres 17, migrated
pnpm test:e2e       # First Value loop through the real Worker routes
pnpm test:rls       # forced-RLS tenant isolation suite
```

`pnpm test:e2e` runs `apps/worker/test/e2e/first-value-loop.e2e.test.ts`, which drives the
actual Worker routes (`app.request`) against real Postgres and real crypto — no package
mocks — and asserts a secret value round-trips through write → grant issue → grant consume.
It self-gates on `integrationDatabaseReady`, so it skips cleanly when no runtime DB is
configured (e.g. in `pnpm verify`), and the fast unit path is unaffected.

## Layer boundaries

- **Unit vs integration**: most package integration suites live alongside unit tests and
  self-gate on `DATABASE_URL_RUNTIME` via `tenant-store/test/rls/load-env`. They skip without
  a DB and execute when one is present.
- **Why not miniflare**: the `postgres` driver uses raw TCP, which workerd can't reach
  locally without Hyperdrive, so the real loop runs in Node Vitest, not the Workers pool. See
  ADR-0065.
- **Preview smoke is gated**: `pr-preview.yml` / `pr-preview-cleanup.yml` only run when the
  repo variable `PREVIEW_ENV_ENABLED == 'true'`. `scripts/ci/smoke-first-value.mjs` hard-fails
  if `SMOKE_BASE_URL` is unset — no green-by-skip once the job runs. Standing up the preview
  Worker + `env.DB` Hyperdrive binding is the prerequisite (tracked in INS-164).

## CI

The `postgres-integration` job in `.github/workflows/ci.yml` resets Docker Compose Postgres
once, then runs `test:rls`, `test:e2e`, and the instance-bootstrap integration suite. The
broad raw-SQL package integration run is not wired in yet — those queries are migrating to
Drizzle, and one suite (`packages/access/.../resolve-machine-effective-access.integration.test.ts`)
has a pre-existing `sql.array` bug that was hidden by green-by-skip; fixing it and wiring the
rest belongs with the Drizzle conversion.
