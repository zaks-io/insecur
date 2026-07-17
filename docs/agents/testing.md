# Testing

insecur's tests are organized by where Postgres comes from and what failure class each catches.
The decision record is [ADR-0065](../adr/0065-test-layers-and-preview-smoke.md).

| Layer                | Postgres                   | Runtime                                                                            | Command                                                                                                                                                                  | Runs where             |
| -------------------- | -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Unit                 | none                       | Node Vitest                                                                        | `pnpm test`                                                                                                                                                              | local, CI, agents      |
| Integration + RLS    | Postgres 17                | Node Vitest, real route stack + `postgres` driver                                  | `pnpm smoke:local` against configured Postgres, or `pnpm smoke:local:docker` to reset Docker Compose Postgres first                                                      | local, CI, agents, PRs |
| Shared preview smoke | shared preview Neon branch | deployed Cloudflare Workers + Hyperdrive + Runtime Service Binding + Secrets Store | `Preview Smoke` stage in the daily release train, or `node packages/tenant-store/scripts/seed-preview-smoke-admission.mjs && pnpm smoke:preview` after deploying preview | shared preview only    |

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

```shell
pnpm build && pnpm exec stryker run --mutate "packages/worker-kit/src/**/*.ts"
pnpm mutation:baseline:update-area packages/worker-kit
node scripts/ci/mutation-ratchet.mjs check packages/worker-kit
```

Other focused examples:

```shell
pnpm build && pnpm exec stryker run --mutate "packages/crypto/src/**/*.ts"
pnpm build && pnpm exec stryker run --mutate "apps/api/src/routes/v1/secrets.ts"
pnpm build && pnpm exec stryker run --mutate "packages/worker-kit/src/http/handle-route.ts:1-80"
```

Use Stryker disable comments sparingly and only after deciding a surviving mutant is equivalent
or intentionally outside this test layer. Prefer adding or tightening tests for real survivors.

## For agents

To run the full DB-backed loop with a clean local database on a laptop or in CI:

```
pnpm smoke:local:docker
```

`pnpm smoke:local:docker` resets and migrates Docker Compose Postgres 17, then runs
`test:rls`, `test:e2e`, and `test:canary` through the same fail-closed runner CI uses. Cursor
Cloud agents use native Postgres 17 from `.cursor/start-postgres.sh` instead. Use
`pnpm smoke:local` when a local Postgres service is already configured and running; it drops and
recreates that database, provisions the local roles, migrates, and then runs the fail-closed smoke
runner. On local machines without `psql`, it falls back to the Docker Compose reset path.

`pnpm test:rls` runs the forced-RLS tenant-store suites plus every workspace package-level
DB-backed `*.integration.test.ts` suite that depends on `DATABASE_URL_RUNTIME`. The suites
are excluded from ordinary package `test` tasks so `pnpm verify` stays unit-only even when a local
Postgres URL exists. Inside the DB-backed configs, the suites still self-gate on
`integrationDatabaseReady` for ad hoc local runs, while the CI gate sets `INSECUR_CI_RLS_GATE=1` so
a missing or unreachable runtime database fails instead of skipping.

`pnpm test:e2e` runs `apps/api/test/e2e/first-value-loop.e2e.test.ts`, which drives the actual
API Worker routes (`app.request`) against real Postgres and real crypto — no package mocks —
composing the API Worker with the Runtime Worker's `RuntimeService` behind an in-process `RUNTIME`
binding (the fast unit layer of the multi-deploy shape; the shared preview smoke will drive the
real Service Binding over HTTP per ADR-0065). It asserts a secret value round-trips through
write → grant issue → grant consume.
It self-gates on `integrationDatabaseReady`, so it skips cleanly when no runtime DB is
configured (e.g. in `pnpm verify`), and the fast unit path is unaffected.

`pnpm test:e2e` also runs the Web BFF's SSR/CSP smoke (`apps/web/scripts/verify-ssr-csp.mjs` via
`@insecur/web` `test:e2e`, which builds the worker first): it boots `dist/server` under Miniflare
with stubbed `API`/`RUNTIME` bindings and asserts every SSR surface renders with a matching CSP
nonce, no inline style attributes, and the unauthenticated console redirect. It needs no database;
it stays out of `pnpm verify` because the vite build + Miniflare boot is too slow for that hot
path. The unit-level companion is the authed-SSR harness in `apps/web/test/support/`.

`pnpm test:cli:postgres` builds the real `insecur` CLI and runs it as a child process against an
in-process API Worker + Runtime Service composition backed by real Postgres. The suite seeds the
standard tenant baseline, mints a short-lived test session credential with `@insecur/auth/testing`,
passes it via `INSECUR_SESSION_TOKEN`, and then exercises metadata-only CLI commands (`whoami`,
`orgs list`, `projects list`, `envs list`). It deliberately does not add a test-login bypass:
auth follows the same signed CLI session credential and admission resolution path as the API e2e
tests. `pnpm smoke:local` and CI's DB-backed runner include this suite after `test:e2e`.

## Layer boundaries

- **Unit vs integration**: DB-backed package integration suites live alongside unit tests but are
  excluded from ordinary package `test` tasks. Run them through `pnpm test:rls`, where
  `tenant-store/test/rls/load-env` loads local DB env and the CI gate fails closed when the runtime
  DB is missing.
- **Why not miniflare**: the `postgres` driver uses raw TCP, which workerd can't reach
  locally without Hyperdrive, so the real loop runs in Node Vitest, not the Workers pool. See
  ADR-0065.
- **PR database policy**: PRs must not provision Neon branches, Hyperdrive configs, or Workers.
  The PR database gate is the `CI` workflow's Docker Compose-backed `Verify` step.
- **Shared preview smoke is release-gated**: `pnpm smoke:preview` hard-fails unless the preview URLs,
  expected SHA, smoke signing secret, smoke actor IDs, and migration database URL are set. The smoke
  mints short-lived credentials during the run; Web preview accepts them only behind the
  `PREVIEW_SMOKE_SESSION_CREDENTIALS=true` preview flag. The daily release train serializes the
  reusable `Deploy Preview` and `Preview Smoke` stages for one exact SHA. Preview preflights all
  Workers before mutation and deploys the shared fleet; smoke then seeds actors and runs the
  `@insecur/preview-smoke` Playwright suite before Production can start.
  Playwright verifies API/Web/Site deploy identities,
  drives the current happy paths over HTTP, exercises the built `insecur` CLI for auth/session and
  metadata navigation (`whoami`, `orgs list`, `projects list`, `envs list`, `config show`, `logout`)
  from isolated temp config directories, runs the First Value CLI proof (`init`, `secrets set`, `run`),
  drives CLI metadata reads and audit surfaces against the live preview tenant (`secrets list`,
  `secrets versions`, `audit tail`, `audit export`, `audit verify` against the published
  `/.well-known/insecur/audit-export-signing-keys.json` signing keys), and drives CLI operation
  polling and Runtime Injection Policy management (`operations get`, `operations wait`,
  `run-policies create`, `run-policies show`, `run-policies disable`) against a service-role-seeded
  operation row and the smoke-created non-protected development environment, including a
  not-found assertion through the CLI process for each of `operations get` and `run-policies show`;
  every CLI stdout/stderr payload and exported artifact is asserted metadata-only and free of the
  smoke sentinel or bearer material. Before failure artifacts upload, the workflow revokes every
  minted smoke session, disables trace capture (request headers carry the bearer), and fails closed
  if the artifact tree contains any bearer encoding. Screenshots, video, HTML, JSON, and JUnit
  diagnostics remain available for normal failures.
  Because no audit-export HMAC secret is wired to the smoke job
  today, `audit verify` is expected to report `status: "invalid"` with
  `audit.export.key_evidence_missing` while hash-chain, signature, and tenant-scope integrity still
  verify, sweeps preview Postgres for the generated sentinel, emits GitHub annotations, and uploads
  HTML, JSON, JUnit XML, screenshot, and video failure artifacts.
  Local runs load ignored `.env.preview` and `.env.local` files before checking required variables.
  `SMOKE_SESSION_SIGNING_SECRET` may be supplied as `SESSION_SIGNING_SECRET`, but it must match the
  API/Web workers under test; a throwaway random value only works for a local Worker stack that was
  started with the same value.

## CI

The DB-backed `Verify` step in `.github/workflows/ci.yml` resets Docker Compose Postgres 17 once,
runs `@insecur/tenant-store` `assert:rls-credentials` (migration vs runtime URLs differ; runtime
`NOBYPASSRLS`), then `scripts/ci/postgres-integration-tests.mjs` which sets
`INSECUR_CI_RLS_GATE=1` and runs every workspace `test:rls` suite, `test:e2e`,
`@insecur/cli` `test:integration`, and `test:canary`; each fails closed under that gate rather
than skipping. The no-plaintext canary gate
([ADR-0069](../adr/0069-no-plaintext-canary-gate.md)) runs after `test:e2e` via
`apps/api/test/canary/no-plaintext-canary.test.ts`: it drives the real route stack with a
fresh high-entropy sentinel, then sweeps every `public` schema column from live
`information_schema` (migration-role connection), captured in-process console output, and
serialized First Value HTTP/RPC egress for raw, base64, base64url, and hex encodings. On egress,
base64url is permitted only at JSON paths ending in `delivery.encodedValueUtf8` (the designed
grant-consume delivery field); any other encoding or path fails. Deployed Worker logs, scheduled
R2 backups, traces, and API analytics are registered as external evidence requirements in
`@insecur/release-gate`; `small_group_production` fails closed until their external zero-finding
sweep evidence is supplied. Their provider query/download implementations do not yet exist in this
repository. KV, Queues, and Durable Objects are not deployed surfaces today. The Plaintext Metadata Allowlist conformance gate
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
mode is active. Turbo `test:rls` fans out to:

- `@insecur/tenant-store` forced-RLS suites plus tenant-store root `*.integration.test.ts` suites.
- `@insecur/access`, `@insecur/audit`, `@insecur/operations`, `@insecur/onboarding`,
  `@insecur/secret-store`, `@insecur/runtime-injection`, `@insecur/machine-auth`, and
  `@insecur/instance-bootstrap` package-level `*.integration.test.ts` suites.

In ordinary `pnpm verify`, these integration suites still keep local fast unit-test behavior by
being excluded from package `test` tasks, even when `DATABASE_URL_RUNTIME` is present.

### Verifying the gate fails closed

After `pnpm dev:db:reset`, a broken policy or `BYPASSRLS` on the runtime role must make
`INSECUR_CI_RLS_GATE=1 pnpm test:rls` fail. Manual drills:

1. Temporarily change a tenant policy `USING` clause to `true` (or grant `BYPASSRLS` to
   `insecur_runtime`), run `node scripts/ci/postgres-integration-tests.mjs`, and confirm red.
2. Revert, re-run `pnpm dev:db:reset`, and confirm green.

CI runs the same path via `postgres-integration-tests.mjs` after every compose reset.

### Sweep-adapter rule (ADR-0069)

Surfaces the canary gate cannot enumerate structurally must register a checked-in evidence
requirement when they land. The release-gate registry covers the deployed R2 backup, Worker log,
Worker trace, and API analytics surfaces and blocks without their evidence. These entries do not
pretend to execute the missing provider-specific sweeps. The in-repo canary gate sweeps Postgres
columns, in-process console output, and serialized First Value HTTP/RPC egress.
