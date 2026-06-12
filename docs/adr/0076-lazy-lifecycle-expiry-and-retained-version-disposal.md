# ADR-0076: Lazy Lifecycle Expiry And Retained Published Version Disposal

Date: 2026-06-12

Status: Accepted

[ADR-0017](0017-protected-environment-promotion-and-rollback.md) defines when an older Published
Version stops being useful — "Once an older Published Version is outside the retention window or
cryptographically unavailable, it is no longer rollback-eligible" — and
[docs/security-plan.md](../security-plan.md) repeats the same eligibility-only rule. Neither says
what happens to the version itself. The sibling lifecycle is explicit in the other direction:
Draft Version Discard crypto-erases the discarded Draft Version's encrypted Sensitive Value
material immediately in V1 (ADR-0017, CONTEXT.md). That asymmetry invites a wrong symmetric
inference. An agent implementing the Secret Version Store — where
[ADR-0025](0025-secret-version-store.md) lists "rollback eligibility as a Retained Published
Version within the Rollback Retention Window" as a concentrated invariant, and the W4 workstream
in [docs/specs/agent-workstreams.md](../specs/agent-workstreams.md) owns tombstones and retention
metadata — has three open guesses: build an erasure job for expired versions, retain ciphertext
forever as a silent posture decision, or stamp eligibility at write time instead of evaluating it
at rollback time. Separately, the no-sweeper posture has only ever been decided edge by edge
([ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md) for sync resumption,
[ADR-0073](0073-operation-execution-liveness-and-abandonment.md) for execution claims,
[ADR-0074](0074-injection-grant-lifecycle-and-revocation.md) for Injection Grants), so every new
time edge re-litigates it. This ADR settles disposal for Retained Published Versions and lifts the
per-edge posture into one corpus-wide rule.

## Decision

### The Rollback Retention Window is evaluated lazily at rollback request time

Rollback eligibility is computed when a Rollback is requested, against the then-current configured
Rollback Retention Window. There is no write-time eligibility stamp, no background state
transition, and no row that flips to "expired" on its own. A request that selects an out-of-window
Retained Published Version fails closed as ineligible, exactly as ADR-0017 already requires.
Because the window is configurable and retention changes are audited (ADR-0017), evaluating
against the current configuration at request time makes a window change effective immediately,
with no backfill or re-stamping job. The window's default duration (proposed 90 days) remains the
open product limit tracked in [docs/open-questions.md](../open-questions.md); this ADR decides
disposal and enforcement mechanics, not the number.

### Expired Retained Published Versions are retained, not crypto-erased, in V1

Window expiry changes eligibility and nothing else. The expired version's wrapped ciphertext stays
in the Secret Version Store as a plain row; V1 ships no erasure path for it, and the
tombstone-plus-crypto-erasure machinery remains exclusive to Draft Version Discard.
Crypto-erasure-on-expiry is deferred to the [docs/phasing.md](../phasing.md) deferred-scope
parking lot as an explicit item rather than an implicit maybe.

Erasure is parked, not dismissed, because it is structurally harder than it looks. Under the flat
wrapped-data-key hierarchy ([ADR-0005](0005-key-hierarchy-and-rotation.md) and
[ADR-0028](0028-instance-secrets-in-secrets-store-with-escrow.md) amendments of 2026-06-03),
Secret Version ciphertext is encrypted under shared organization and project data keys; no
per-version key exists whose destruction erases one version. Per-version crypto-erasure therefore
means deleting the ciphertext bytes themselves — and accounting for every durable copy of them,
including encrypted backups — not destroying a key. That deserves its own decision when promoted.

Retention in V1 is a statement about what window expiry does, not a durability guarantee for
expired ciphertext. ADR-0017's "cryptographically unavailable" clause still applies: eligibility
requires key material present (ADR-0025), and key destruction, customer custody revocation
([ADR-0050](0050-customer-managed-key-custody.md) Custody-Locked), or a rotation event that
retires key material can make retained ciphertext undecryptable. "Retained, not crypto-erased"
must not be read as a promise that expired ciphertext survives key destruction or rewrap.

### Time-based lifecycle edges are evaluated lazily; V1 ships no runtime data-lifecycle scheduler

Where a V1 time-based lifecycle edge exists — the Rollback Retention Window, the Injection Grant
TTL, Sync Target Serialization lease expiry, and Operation execution claims — it is evaluated
lazily at access or claim time. V1 ships no background sweeper, cron, or scheduled runtime
data-lifecycle job.

This codifies existing per-edge behavior rather than introducing new mechanics. Lease expiry is
already lazy: a run may reclaim a lease once expired, and the fencing token is checked before each
provider write (ADR-0057). Injection Grant expiry already fails closed at use: clock expiry is
evaluated inside the consume compare-and-set, surfacing as `injection.grant_expired` in
[docs/cli-and-sync.md](../cli-and-sync.md) (ADR-0074). Execution-claim abandonment is already
evaluated only at read and claim time (ADR-0073). The Rollback Retention Window is the only edge
gaining new normative coverage from this rule.

The rule is scoped to runtime data-lifecycle edges and cuts in both directions:

- It does not create time edges. [ADR-0066](0066-operation-idempotency-key-contract.md)
  deliberately gives idempotency keys no expiry; Approval Requests do not expire by age
  (ADR-0017); an `incomplete` Operation does not age out (ADR-0057). Those no-TTL decisions stand.
- It does not cover scheduled jobs that are not data-lifecycle expiry. The CI `security-daily`
  workflow cron is build-pipeline infrastructure, and ADR-0072's Worker cron backup export is a
  scheduled operational and infrastructure job, not a data-lifecycle expiry; both are explicitly
  out of this rule's scope.

## Options Considered

- **Crypto-erase expired Retained Published Versions, symmetric with Draft Version Discard.**
  Deferred, not rejected. It needs either a background job, which the rule above forbids, or
  erasure piggybacked onto unrelated requests; and under shared wrapped data keys it means
  ciphertext deletion across every durable copy, including encrypted backups, rather than key
  destruction. That is a real design problem worth its own promotion from the parking lot, and the
  posture record's rule against implying secure deletion without a governing ADR
  ([docs/security-and-privacy-posture-record.md](../security-and-privacy-posture-record.md)) is
  upheld by making V1 retention explicit in the meantime.
- **A background sweeper or cron that marks or erases expired versions.** Rejected. ADR-0057,
  ADR-0073, and ADR-0074 each rejected a sweeper for their edge; lazy evaluation enforces expiry
  at the only place eligibility matters, the rollback request, and adds no infrastructure.
- **Write-time eligibility stamping.** Rejected. Precomputing an eligible-until value or flag at
  publish goes stale the moment the configurable window changes, forcing exactly the backfill job
  this ADR refuses; evaluating at request time keeps retention changes immediately effective.
- **Keep deciding the no-sweeper posture per edge.** Rejected. Each new time edge would re-argue
  the same posture, and an agent meeting an edge without its own ADR — as the Rollback Retention
  Window was — has no rule to fall back on. One caller-agnostic invariant is cheaper than four
  local ones.

## Consequences

- The Secret Version Store keeps expired Retained Published Versions as plain rows: no erasure
  tombstones, no expiry status column, no scheduled transition. ADR-0025's rollback-eligibility
  invariant gains its enforcement point — evaluated at rollback request time against the current
  window — and its test is a store-level unit test plus integration coverage inside the existing
  layers ([ADR-0065](0065-test-layers-and-preview-smoke.md)), not a new gate.
- ADR-0017 requires retention expiry to be audited. Under lazy evaluation the auditable event is
  the observation: a rollback request denied because the selected version is out of window records
  that expiry-based denial at request time. No scheduled job exists to emit a wall-clock expiry
  event, and none is needed to satisfy the audit requirement.
- The [docs/phasing.md](../phasing.md) deferred-scope parking lot must gain
  crypto-erasure-on-expiry for Retained Published Versions as an explicit deferred item, with the
  V1 boundary being lazy eligibility plus ciphertext retention; that edit changes together with
  this ADR.
- product-spec section 6 and CONTEXT.md's Retained Published Version entries carry the
  retained-not-erased invariant, and product-spec section 2 carries the corpus-wide lazy-expiry
  rule beside the existing Queues and Durable Objects deferral; those summaries change together
  with this ADR.
- A future ADR that adds a time-based runtime lifecycle edge inherits lazy evaluation as the
  default and must supersede this rule to introduce any scheduled runtime data-lifecycle job.
  Scheduled operational jobs, such as ADR-0072's backup export, remain unaffected.
