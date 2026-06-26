# ADR-0073: Operation Execution Liveness And Abandonment

Date: 2026-06-12

Status: Accepted

Sync execution runs inline in the triggering request (ADR-0057), so a crashed or evicted executor
strands an Operation in `running`: ADR-0057's only parking path to `incomplete` is written by a
live executor, and [docs/operation-store.md](../operation-store.md)'s derived sets make `running`
non-retryable. The sync itself is not blocked forever — the Sync Target Serialization lease
expires and admits a fresh run — and the transition matrix already permits `running →
incomplete` and `running → canceled`. The real damage is threefold. First, ADR-0066 pins an
idempotency key to its Operation row's lifetime, so the documented agent retry pattern in
[docs/cli-and-sync.md](../cli-and-sync.md) ("retry with the same operation ID or idempotency
key") returns the dead `running` Operation forever. Second, `operations wait` on that Operation
never resolves, because the dead executor will never move it. Third, no document defines when a
third party may legitimately move someone else's `running` Operation: cancel is legal but
terminal, destroying the same-ID resume that ADR-0057 calls the path back for partial writes.
This ADR pins the missing liveness criterion before the operations, sync-runtime, and CLI
workstreams encode incompatible ones.

## Decision

Implementation note: non-lease `execution_deadline` claims and lazy abandonment parking landed in
INS-219 in `@insecur/operations` (`resolve-operation-liveness.ts`, migration
`0007_operation_execution_deadline.sql`). Where a Sync Target Serialization lease exists, the lease
remains the claim.

- **Every `running` Operation carries an execution claim.** The claim is established at every
  compare-and-set transition into `running`, including resume from `incomplete` or `blocked`.
  Where a Sync Target Serialization lease exists, the lease is the claim: its `expires_at` and
  monotonic fencing token (ADR-0057) govern liveness. Every other Operation records an
  `execution_deadline` on the Operation at the transition into `running`; the deadline is
  metadata-safe and must comfortably exceed the inline execution budget of the request doing the
  work. The claim applies only while the Operation is in `running`: `running →
waiting_for_human` legally sheds it, matching the no-expiry stance on Approval Requests, and an
  `incomplete` Operation still does not age out.
- **An expired claim means abandoned, evaluated lazily.** A `running` Operation whose claim has
  expired is abandoned. Abandonment is evaluated only at read and claim time — `getOperation`
  polling, `createOperation` idempotent-retry resolution, lease claims, and the `syncs run`
  conflict check. There is no background sweeper or cron, consistent with ADR-0057.
- **Abandoned Operations are always parked as `incomplete`.** Recovery is a single
  compare-and-set arm: `running → incomplete` with `cause` `retryable` and the metadata-only
  progress flag `abandoned`. There is no `running → blocked` arm, because `blocked` means
  deterministic pre-effect validation failed and a parker cannot prove a dead executor attempted
  no live effect. Instead, operation-store.md's `incomplete` meaning is amended to "live effects
  started or may have started". The parked Operation then follows the existing same-ID resume
  contract unchanged.
- **Parking authority is cancel authority.** Parking an abandoned Operation requires the same
  authorization as `cancelOperation`, and no broader grant. The Operation Store still does not
  own authorization semantics — callers supply resolved actor scope — but the required authority
  is pinned here so all consumers enforce the same one.
- **The `execution_deadline` path has no fencing token, and the resulting race is accepted.** A
  slow-but-alive executor that overruns its deadline can race a parker. The parker's CAS lands
  `running → incomplete`; the executor's subsequent CAS then fails closed against the parked
  state, and the executor must treat that failure as loss of its claim and stop. Effects the slow
  executor performs between deadline expiry and its failed CAS are possible; the amended
  `incomplete` meaning and the idempotent resume contract absorb them, and this outcome is
  accepted for V1. Operations that need pre-effect stale-writer denial must use the lease, which
  checks the fencing token before each provider write.
- **The `syncs run` conflict rule extends to open `running` Operations.** A live claim is
  rejected as the existing retryable `sync.target_busy` (exit 8); no new error code is minted. An
  expired claim parks the abandoned Operation `incomplete` as above, after which the existing
  open-`incomplete` conflict rule applies unchanged: conflict (exit 6) pointing at the Operation
  ID, resumable with `operations retry`. cli-and-sync.md's Sync Execution Runtime carries the
  command-facing text.

## Options Considered

- **A `running → blocked` arm when recorded progress shows zero writes.** Rejected. `blocked` is
  defined as deterministic pre-effect validation failure, which abandonment is not, and absent
  per-binding progress does not prove a dead executor attempted no live effect. One parking arm
  keeps the state table and the matrix self-consistent.
- **A background sweeper that parks expired claims.** Rejected. ADR-0057 deliberately ships no
  sweeper or cron for sync parking and resumption; lazy evaluation recovers an abandoned
  Operation exactly when a caller cares about it and adds no infrastructure.
- **Expiring the idempotency key instead of recovering the row.** Rejected. ADR-0066 explicitly
  rejected TTL-based key expiry, and the poison is the row's state, not the key contract.
  Recovering the row makes the same key resolve to a resumable Operation, which is the retry
  semantics agents already expect.
- **A fencing token for the `execution_deadline` path.** Rejected for V1. Checking a token before
  every effect is precisely the lease machinery; duplicating it for deadline-only Operations buys
  little because the parked-state CAS already fails the stale executor closed, at the accepted
  cost of the race above.
- **Direct takeover, where a new executor re-enters `running` over an expired claim.** Rejected.
  Park-then-resume reuses the existing `incomplete` conflict and same-ID resume contract instead
  of minting a second recovery vocabulary, and keeps "who is executing" answerable from the claim
  alone.

## Consequences

- [docs/operation-store.md](../operation-store.md) carries the execution-claim rule in its State
  Model, amends `incomplete` to "live effects started or may have started", and adds the
  transition test bullet: abandoned `running` Operations are reclaimable only after claim expiry
  and only via CAS. Those tests are transition tests inside the existing integration layer
  (ADR-0065), not a new layer or gate.
- [docs/cli-and-sync.md](../cli-and-sync.md)'s Sync Execution Runtime gains the open-`running`
  conflict rule, and `operations wait` resolves as `incomplete` (exit 9) once an authorized
  reader parks the abandoned Operation, instead of hanging forever.
- `packages/operations` records the claim at every transition into `running`, evaluates
  abandonment in the get, create-resolve, and lease-claim paths, and implements the parking arm.
  `operation-states.ts` stays in lockstep with operation-store.md; no new states and no new error
  codes are introduced.
- ADR-0066 is unaffected: the key retention rule stands, and a retried `createOperation` with the
  same key now resolves to a parked, resumable Operation rather than a dead `running` one.
- A slow executor on the deadline path may perform effects that race a parker; the resume path
  must stay idempotent for that reason, which the per-binding rewrite-only-pending-and-failed
  contract already satisfies for sync.
