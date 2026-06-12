# Setup

There is not yet a supported product setup path for storing or delivering secrets. The accepted
setup path today is contributor and agent verification of the scaffold.

1. Use Node 24 and pnpm 10.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Run `pnpm dev:check`.
4. Run `pnpm verify`.
5. Run `pnpm duplicates:check` when touching repeated logic or shared helpers.
6. Run `pnpm build`.
7. Optionally run the copyable proof:
   `INSECUR_PROOF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node examples/first-value-proof/verify.mjs`.

The local Worker can be started with:

```sh
pnpm dev:worker
```

Then check `http://localhost:8787/healthz` for liveness. The Worker also serves the `/v1` product
routes (auth/session, onboarding, non-protected secret write, Runtime Injection grants); the First
Value loop test (`pnpm test:e2e`) drives those real routes against local Postgres.

## Local Configuration

- `.env.example` documents optional service keys for future product slices.
- Copy keys into `.env.local` only when a task explicitly needs real service access.
- `apps/worker/.dev.vars.example` documents local Worker variable placement.
- `.env.local`, `.env.production`, and `.dev.vars` are ignored and must not be committed.

`pnpm dev:check` reports missing optional service keys by name and never prints values.

## Local Postgres

The local database uses Docker Compose with Postgres 17, matching the stable Neon target while
Postgres 18 remains preview on Neon ([ADR-0060](adr/0060-postgres-17-development-baseline.md)).
It is the substrate for the authoritative integration+RLS test layer:
`pnpm dev:db:reset && pnpm test:rls && pnpm test:e2e && pnpm test:canary` runs the forced-RLS tenant suite, the
First Value loop, and the no-plaintext canary gate locally, and CI's `postgres-integration` job enforces the same layer with
`INSECUR_CI_RLS_GATE=1`. Neon appears only in the gated preview smoke layer, which runs the First
Value smoke against a deployed preview Worker — not `test:rls`. See
[docs/agents/testing.md](agents/testing.md) and
[ADR-0065](adr/0065-test-layers-and-preview-smoke.md).

Start the local database:

```sh
pnpm dev:db:up
```

Reset it from scratch and run the role guard:

```sh
pnpm dev:db:reset
```

Run only the guard against an already-started database:

```sh
pnpm dev:db:guard
```

The first DB command generates local-only values into ignored `.env.local` if they are missing. The
scaffold creates separate migration and runtime roles and checks that the runtime role is distinct,
can connect, and has `rolbypassrls=false`. It also pins Neon-adjacent local settings for SCRAM
password auth, `idle_in_transaction_session_timeout`, and `max_connections`. The guard proves role
posture and local configuration only; complete tenant-isolation coverage belongs to
`pnpm test:rls` running as the `NOBYPASSRLS` runtime role via `DATABASE_URL_RUNTIME` against this
Docker Compose Postgres.

V1 product setup guidance should be written only after the tenant-first authorization model,
WorkOS AuthKit, short-lived machine access, tenant-bound key hierarchy, Sensitive Metadata
encryption, audit/export integrity, and
[security release gates](security-runbooks-and-release-gates.md) are implemented. Until then,
scaffold verification commands are contributor documentation only and must not be used with
valuable secrets.
