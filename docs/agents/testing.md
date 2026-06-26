# Testing

insecur's tests are organized into three layers by where Postgres comes from and what
failure class each catches. The decision record is [ADR-0065](../adr/0065-test-layers-and-preview-smoke.md).

| Layer             | Postgres              | Runtime                                           | Command                                                                   | Runs where             |
| ----------------- | --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------- |
| Unit              | none                  | Node Vitest                                       | `pnpm test`                                                               | local, CI, agents      |
| Integration + RLS | Docker Compose        | Node Vitest, real route stack + `postgres` driver | `pnpm dev:db:reset && pnpm test:rls && pnpm test:e2e && pnpm test:canary` | local, CI, agents      |
| Preview smoke     | ephemeral Neon branch | deployed Worker + Hyperdrive                      | `pr-preview.yml` (gated)                                                  | per-PR CI once enabled |

## Manual Mutation Review

Mutation testing is advisory only. It is not part of `pnpm verify`, CI, or pre-push.

Run a setup check first:

```
pnpm mutation:dry-run
```

Run a review:

```
pnpm mutation:review
```

Run the manual ratchet:

```
pnpm mutation:ratchet
```

Reports are written under `reports/mutation/`. Open `reports/mutation/index.html` for the
human review and use `reports/mutation/mutation.json` for scripting. The command uses
Stryker's Vitest runner against the DB-less unit-test project list from
`vitest.mutation.config.ts`; integration, RLS, e2e, and canary suites stay in their dedicated
commands. CLI tests use per-worker `INSECUR_CONFIG_HOME` isolation via `packages/cli/test/setup.ts`
so Stryker's Vitest runner does not depend on the developer machine home directory.

`vitest.mutation.config.ts` also disables file-level test parallelism because Stryker already
controls worker parallelism. The default run is incremental and advisory: it reuses previous
results when possible and never fails solely because the mutation score is low. To rebuild the
mutation cache:

```
pnpm mutation:force
```

The ratchet baseline lives in `config/mutation-ratchet.json`. To check the latest report without
rerunning Stryker:

```
pnpm mutation:ratchet:check
```

After intentionally accepting an improved or otherwise changed baseline:

```
pnpm mutation:baseline:update
```

To review a focused area, pass Stryker's `--mutate` override after `pnpm build`:

```
pnpm build && pnpm exec stryker run --mutate "packages/worker-kit/src/**/*.ts"
pnpm mutation:baseline:update-area packages/worker-kit
node scripts/ci/mutation-ratchet.mjs check packages/worker-kit
```

Other focused examples:

```
pnpm build && pnpm exec stryker run --mutate "packages/crypto/src/**/*.ts"
pnpm build && pnpm exec stryker run --mutate "apps/api/src/routes/v1/secrets.ts"
pnpm build && pnpm exec stryker run --mutate "packages/worker-kit/src/http/handle-route.ts:1-80"
```

Use Stryker disable comments sparingly and only after deciding a surviving mutant is equivalent
or intentionally outside this test layer. Prefer adding or tightening tests for real survivors.

## For agents

To run the full DB-backed loop with no cloud credentials, only Docker:

```
pnpm dev:db:reset   # Docker Compose Postgres 17, migrated
pnpm test:e2e       # First Value loop through the real Worker routes
pnpm test:rls       # forced-RLS tenant isolation suite
pnpm test:canary    # no-plaintext canary gate (Postgres columns + console output)
```

`pnpm test:e2e` runs `apps/api/test/e2e/first-value-loop.e2e.test.ts`, which drives the actual
API Worker routes (`app.request`) against real Postgres and real crypto — no package mocks —
composing the API Worker with the Runtime Worker's `RuntimeService` behind an in-process `RUNTIME`
binding (the fast unit layer of the multi-deploy shape; the preview smoke drives the real Service
Binding over HTTP per ADR-0065). It asserts a secret value round-trips through write → grant issue
→ grant consume.
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
`INSECUR_CI_RLS_GATE=1` and runs `test:rls`, `test:e2e`, and `test:canary`; each fails closed under that gate
rather than skipping. The no-plaintext canary gate
([ADR-0069](../adr/0069-no-plaintext-canary-gate.md)) runs after `test:e2e` via
`apps/api/test/canary/no-plaintext-canary.test.ts`: it drives the real route stack with a
fresh high-entropy sentinel, then sweeps every `public` schema column from live
`information_schema` (migration-role connection) and captured in-process console output for
raw, base64, base64url, and hex encodings. Deployed worker logs, R2, KV, Queues, Durable
Objects, traces, and analytics are not swept until their sweep adapters land (see sweep-adapter
rule below). The Plaintext Metadata Allowlist conformance gate
([ADR-0070](../adr/0070-plaintext-metadata-allowlist-registry-and-conformance-gate.md)) runs in
the unit layer via `packages/tenant-store/test/plaintext-metadata-conformance.test.ts` inside
`pnpm verify`, and in the integration layer via
`packages/tenant-store/test/rls/plaintext-metadata-conformance.integration.test.ts` inside
`test:rls`. Turbo
`envMode: strict` only
forwards `INSECUR_CI_RLS_GATE` when it is listed on the `test:rls` / `test:e2e` / `test:canary`
tasks in
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

### Sweep-adapter rule (ADR-0069)

Surfaces the canary gate cannot enumerate structurally — R2 export files, Queue payloads,
Durable Object state, KV, traces, analytics sinks, local CLI config — must register a checked-in
sweep adapter when they land. A non-enumerable surface landing without an adapter is a
review-blocking violation from that point on. The registry mechanism is built with the first
such surface; today the gate sweeps Postgres columns and in-process console output only.
