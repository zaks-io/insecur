# Testing

insecur's tests are organized into three layers by where Postgres comes from and what
failure class each catches. The decision record is [ADR-0065](../adr/0065-test-layers-and-preview-smoke.md).

| Layer             | Postgres              | Runtime                                           | Command                                                                                                      | Runs where             |
| ----------------- | --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Unit              | none                  | Node Vitest                                       | `pnpm test`                                                                                                  | local, CI, agents      |
| Integration + RLS | Docker Compose        | Node Vitest, real route stack + `postgres` driver | `pnpm dev:db:reset && pnpm test:rls && pnpm test:e2e` today; `pnpm test:canary` is decided but not wired yet | local, CI, agents      |
| Preview smoke     | ephemeral Neon branch | deployed Worker + Hyperdrive                      | `pr-preview.yml` (gated)                                                                                     | per-PR CI once enabled |

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
17 once, runs `@insecur/tenant-store` `assert:rls-credentials` (migration vs runtime URLs differ;
runtime `NOBYPASSRLS`), then `scripts/ci/postgres-integration-tests.mjs` which sets
`INSECUR_CI_RLS_GATE=1` and runs `test:rls` and `test:e2e`; each fails closed under that gate
rather than skipping. The no-plaintext canary gate
([ADR-0069](../adr/0069-no-plaintext-canary-gate.md)) is decided but not wired yet: there is
currently no root `test:canary` script and no canary task in
`scripts/ci/postgres-integration-tests.mjs`. The Plaintext Metadata Allowlist conformance gate
([ADR-0070](../adr/0070-plaintext-metadata-allowlist-registry-and-conformance-gate.md)) runs in
the unit layer via `packages/tenant-store/test/plaintext-metadata-conformance.test.ts` inside
`pnpm verify`, and in the integration layer via
`packages/tenant-store/test/rls/plaintext-metadata-conformance.integration.test.ts` inside
`test:rls`. Turbo
`envMode: strict` only
forwards `INSECUR_CI_RLS_GATE` when it is listed on the `test:rls` / `test:e2e` tasks in
`turbo.json`; a probe task (`assert:ci-rls-gate-env`) runs first so CI logs prove the var
reached the task process. Vitest setup logs `[insecur] INSECUR_CI_RLS_GATE=1` when fail-closed
mode is active. Turbo `test:rls` fans out to
`@insecur/tenant-store` (forced-RLS suite: tenant isolation, data-key isolation, secret-version
concurrency) and `@insecur/access` (`*.integration.test.ts`). The job then runs
`@insecur/instance-bootstrap` integration tests. Other packages' `*.integration.test.ts` files
still self-gate in `pnpm verify` until the Drizzle conversion wires them.

### Verifying the gate fails closed

After `pnpm dev:db:reset`, a broken policy or `BYPASSRLS` on the runtime role must make
`INSECUR_CI_RLS_GATE=1 pnpm test:rls` fail. Manual drills:

1. Temporarily change a tenant policy `USING` clause to `true` (or grant `BYPASSRLS` to
   `insecur_runtime`), run `node scripts/ci/postgres-integration-tests.mjs`, and confirm red.
2. Revert, re-run `pnpm dev:db:reset`, and confirm green.

CI runs the same path via `postgres-integration-tests.mjs` after every compose reset.
