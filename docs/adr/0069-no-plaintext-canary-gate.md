# ADR-0069: No-Plaintext Canary Gate

Date: 2026-06-12

Status: Accepted

No Plaintext Persistence and Secret-Free Logging are the most-restated invariants in the corpus,
and every restatement defers to canary tests that exist nowhere as a named gate. The "No plaintext
persistence" readiness control in [docs/storage-security-gate.md](../storage-security-gate.md)
cites canary-value tests as its Primary Evidence; the release-gate criteria in
[docs/security-plan.md](../security-plan.md) require No Plaintext Persistence and Secret-Free
Logging tests to pass with canary Sensitive Values; the `first_value.no_plaintext`,
`storage.no_plaintext`, and `telemetry.safe` rows in
[docs/production-mvp-acceptance.md](../production-mvp-acceptance.md) and the storage and telemetry
rows in [docs/security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md)
all list canary tests as evidence. Yet [ADR-0065](0065-test-layers-and-preview-smoke.md) and
[docs/agents/testing.md](../agents/testing.md) define exactly three layers with no canary gate,
the root `package.json` has no canary script, and no architecture group in
[docs/specs/architecture-groups.md](../specs/architecture-groups.md) owns the harness. The only
enforcement today is hand-written vigilance: the
`expect(JSON.stringify(...)).not.toContain(plaintext)` assertions in
`apps/api/test/e2e/first-value-loop.e2e.test.ts` covering the write response body, the
grant-issue response body, the consume audit rows, and the replay-denial error body. Those four
assertions are the pattern this ADR generalizes: at fleet scale, agents will keep adding tables,
operation payloads, audit event types, and log lines, and nothing fails when one of them persists
plaintext.

## Decision

A no-plaintext canary gate exists as `pnpm test:canary`, a fourth named command inside the
existing integration layer. It is a command, not a new layer; ADR-0065's three-layer vocabulary
stands unchanged.

Implementation note: the gate contract is defined here; the harness lives in
`apps/api/test/canary/` and runs via `pnpm test:canary` in the `postgres-integration` job after
`test:e2e`.

- **Where it runs.** `test:canary` runs in CI's existing `postgres-integration` job, after
  `test:e2e`, via `scripts/ci/postgres-integration-tests.mjs`. It fails closed under the same env
  gate that already governs the job's DB-backed suites: when `INSECUR_CI_RLS_GATE=1` is set and no
  runtime database is reachable, the suite throws instead of skipping, exactly as `test:e2e` does
  through `integrationDatabaseReady` today. Locally without a database it skips cleanly, so
  `pnpm verify` and the fast unit path are unaffected. No second gate variable is minted; the
  existing one already gates `test:e2e`, not only RLS, and two switches for one job is a footgun.
- **Mechanism.** The harness drives the real route stack (`app.request` against the actual Hono
  app, real Postgres, real crypto, no package mocks) with unique high-entropy sentinel Sensitive
  Values minted fresh per run, so a match is never a fixture coincidence. It then sweeps:
  - **Every column of every user table**, enumerated live from `information_schema` at sweep time
    rather than from a hand-maintained list. A new table is swept the day its migration lands,
    with zero per-feature action. This enumeration structurally includes operation records and
    audit rows, named here explicitly because they are the highest-risk metadata surfaces.
  - **In-process console output** captured during the run.
  - **Serialized HTTP egress** from the First Value loop: write, grant-issue, and grant-consume
    response bodies and headers.
  - **Serialized Runtime-to-API RPC delivery** from `consumeGrant` (the envelope captured before
    the API unwraps it to the HTTP response).

  The persistence and console sweeps assert no sentinel appears anywhere, matching each sentinel
  raw and in its common transport encodings (base64, base64url, hex), since a persisted encoding
  of a Sensitive Value is still plaintext persistence. Ciphertext columns pass by construction: a
  correctly encrypted sentinel is not substring-matchable.

  The egress sweep uses the same four encodings. By design, grant consume returns the decrypted
  value only as base64url UTF-8 in `delivery.encodedValueUtf8`. The egress sweep therefore
  permits base64url **only** at JSON paths ending in `delivery.encodedValueUtf8` (for example
  `delivery.encodedValueUtf8` on the HTTP consume body and `value.delivery.encodedValueUtf8` on
  the Runtime RPC envelope `{ ok: true, value: { delivery: { encodedValueUtf8 } } }`). Any raw,
  base64, or hex hit, or any base64url hit outside that delivery field, fails the gate.

- **Connection.** The harness connects directly with the migration/admin connection
  (`DATABASE_URL_MIGRATION`), exactly as the RLS harness already connects outside the store for
  seeding and setup. The sweep needs cross-tenant, RLS-bypassing reads of every table, which the
  Tenant-Scoped Store deliberately cannot provide: its pool is private and no raw executor leaves
  the module ([ADR-0037](0037-tenant-scoped-bound-store-over-rls.md)). No enumeration surface is
  added to the Tenant-Scoped Store for this gate.
- **Ownership.** AG10 owns the harness outright, as an extension of its existing "Security release
  gates and evidence bundles" ownership in
  [docs/specs/architecture-groups.md](../specs/architecture-groups.md). There is no AG1 interface
  commitment; AG1's store surface is untouched.
- **Sweep-adapter rule (normative, mechanism deferred).** Surfaces the gate cannot enumerate
  structurally — R2 export files, Queue payloads, Durable Object state, KV, traces, analytics
  sinks, local CLI config — must register a checked-in sweep adapter when they land, and the
  registration list is a review-visible checked-in artifact. The registry mechanism is not built
  now: zero such surfaces exist today, so it would ship with zero adapters. It is built at the
  first non-enumerable surface, and a non-enumerable surface landing without an adapter is a
  review-blocking violation of this rule from that point on.
- **Honest evidence scope.** The gate proves exactly: Postgres columns (including operation
  records and audit rows), in-process captured console output, and serialized First Value HTTP/RPC
  egress with the `delivery.encodedValueUtf8` allowance above. It does not prove deployed worker
  logs, which belong to the preview-smoke layer or a future adapter, and it does not prove R2, KV,
  Durable Objects, Queues, traces, or analytics until their adapters exist. Docs that cite canary
  evidence must cite `pnpm test:canary` for the enumerated surfaces and mark the rest as pending
  adapters or preview-layer coverage, never swapping one fictional evidence citation for another.

The existing ad-hoc `not.toContain` assertions in `first-value-loop.e2e.test.ts` stay as
per-response regression guards. The canary gate generalizes their pattern structurally across
persistence, logging, and serialized egress rather than replacing them.

## Options Considered

- **Keep per-feature `not.toContain` assertions only.** Rejected. That is per-surface vigilance:
  the invariant's real coverage becomes whatever assertions individual agents remembered to write,
  and nothing fails when a new table, operation payload, or audit event type persists plaintext.
- **Hand-maintained list of tables and columns to sweep.** Rejected. A curated list is stale the
  day the next migration lands and silently under-sweeps from then on. Live `information_schema`
  enumeration makes coverage a structural property instead of a maintenance chore.
- **Expose enumeration through the Tenant-Scoped Store.** Rejected. The store contract is
  no-raw-executor with a private pool (ADR-0037), and the sweep needs RLS-bypassing cross-tenant
  reads the store deliberately cannot provide. An enumeration surface in product code with one
  test consumer also fails the deletion test: it is speculative indirection where a direct
  migration-role connection, the pattern the RLS harness already uses, does the job.
- **Build the sweep-adapter registry now.** Deferred. R2 exports, Queue payloads, DO state, KV,
  and local CLI config do not exist yet, so the registry would ship empty. The rule is normative
  now; the mechanism lands with the first surface that needs it.
- **A new test layer or a new gate variable.** Rejected. ADR-0065's layers answer "where does
  Postgres come from"; the canary gate uses the same Docker Compose Postgres as the rest of the
  integration layer, so it is a fourth command there, and it reuses the proven
  `INSECUR_CI_RLS_GATE` fail-closed switch rather than inventing a parallel one.

## Consequences

- A table added by any architecture group is swept automatically the day its migration lands; the
  no-plaintext invariant stops depending on each agent remembering to write assertions.
- [docs/agents/testing.md](../agents/testing.md) gains `test:canary` in its layer table and CI
  section; the evidence rows in [docs/storage-security-gate.md](../storage-security-gate.md),
  [docs/security-plan.md](../security-plan.md), and
  [docs/production-mvp-acceptance.md](../production-mvp-acceptance.md) cite the named command
  scoped to what it proves, with non-enumerated surfaces marked pending. Those doc edits propagate
  this ADR; this ADR is the decision record.
- AG10's Owns list in [docs/specs/architecture-groups.md](../specs/architecture-groups.md) gains the
  canary harness. The recovery canary in [ADR-0058](0058-minimal-backup-and-tested-restore.md) is
  a distinct artifact (a known-plaintext restore sentinel) and is unaffected.
- Sweep runtime grows with schema size. At First-Value scale it is a handful of tables; if it ever
  becomes the slowest step in `postgres-integration`, the sweep can batch per-table queries
  without changing the contract.
- Deployed worker-log sweeping remains an open obligation of the preview-smoke layer or a future
  adapter; this gate's console capture covers in-process output only, and the docs must keep
  saying so.
