# Operation Store

The Operation Store is the durable metadata Module for user-visible workflows that may need status,
waiting, retry, resume, cancellation, or audit correlation. Its Interface is intentionally narrow:
callers create an Operation with metadata-safe intent, move it through compare-and-set state
transitions, attach metadata-only progress, and return an Operation ID that humans, agents, CI, and
runbooks can poll or retry.

The Module exists because Operation state is shared across sync, runtime injection, approval
step-up, rotation, backup, restore, provider reauthorization, and future queued execution. If each
caller invents its own status table or retry shape, agents cannot reason about recovery and audit
cannot reconstruct what happened. The leverage is one durable workflow vocabulary; the locality is
one place for idempotency, lease metadata, wait/retry state, and Sensitive Value exclusions.

## Scope

The Operation Store owns:

- Operation ID creation and tenant-qualified Operation records.
- Idempotency keys for non-create mutations and operation-start requests.
- Metadata-only status, progress, wait, retry, and cancellation state.
- Compare-and-set transitions that prevent stale writers from moving an Operation backward.
- Sync Target Serialization lease rows and fencing-token metadata for Inline Sync Execution.
- Per-binding Secret Sync progress references for Incomplete Sync Runs.
- Bounded operation references used by High-Assurance Challenge and agent step-up flows.
- Audit references that let the Audit Event Writer correlate events to one Operation.

The Operation Store does not own:

- Provider writes, decrypt, Runtime Injection, Keyring, or Secret Version Store behavior.
- Authorization semantics. Callers supply resolved actor scope and the required Authorization Scope.
- Audit event formatting or export. The Operation stores audit references, not the Audit Log.
- Human Approval Surface UI or notification delivery.
- Queue execution. Cloudflare Queues and Durable Objects are deferred past V1; a future queue
  consumer must honor this same Operation Interface.
- Sensitive Values, Provider Credentials, key material, decrypted Sensitive Metadata, raw provider
  bodies, child-process environments, or local file contents.

## Interface

The Interface should be small and state-oriented:

- `createOperation(scope, intent, idempotencyKey?)` creates or returns the one matching Operation for
  a retried request.
- `transition(operationId, expectedState, nextState, metadata)` performs a compare-and-set state
  move and records metadata-only progress.
- `recordProgress(operationId, progress)` attaches safe counters, provider status codes normalized
  to product codes, target IDs, retry hints, wait reasons, or audit IDs.
- `claimLease(operationId, target, ttl)` claims a Sync Target Serialization lease and returns a
  fencing token.
- `renewLease(operationId, fencingToken, ttl)` extends an active lease between provider writes.
- `releaseLease(operationId, fencingToken)` releases the lease after success, cancellation, blocked
  pre-write failure, or incomplete parking.
- `getOperation(operationId)` returns status and safe progress for polling.
- `retryOperation(operationId)` re-enters a resumable Operation without creating a new Operation ID.
  Per the [ADR-0032](adr/0032-agent-session-execution-and-step-up.md) 2026-06-12 amendment, this
  extends to a `waiting_for_human` Operation carrying cleared High-Assurance Challenge evidence: the
  resume atomically consumes the single-use evidence in the same compare-and-set as the
  `waiting_for_human → running` transition, so concurrent resumes lose deterministically and
  evidence is never consumed twice.
- `cancelOperation(operationId)` closes a cancelable Operation through compare-and-set state.

The exact function names can differ. The required Interface shape is one Operation ID, explicit
state transitions, metadata-only progress, idempotent retries, and no access to private workflow
implementation tables by callers.

## Idempotency Key Contract

ADR-0066 pins the target idempotency contract:

- Idempotency keys are unique per Organization, matching the shipped
  `operations_org_idempotency_key_idx` partial unique index on `(org_id, idempotency_key)`.
- A retried `createOperation` with the same key and the same intent code returns the existing
  Operation with `created=false`; no second Operation or live effect is created.
- The same key with a different intent code fails with the stable error code
  `operation.idempotency_mismatch` (part of `OPERATION_ERROR_CODES` in
  `packages/domain/src/error-codes.ts`; maps to CLI exit 6 and HTTP `409`).
- Payload or progress differences alone are not a mismatch in V1; intent-code identity is the
  normative check.
- Retention is explicit: V1 has no separate key expiry. A key stays claimed exactly as long as its
  Operation row exists.

## Intent Codes

[ADR-0068](adr/0068-stable-dotted-code-vocabularies-in-canonical-catalogs.md) pins operation intent
codes to a canonical `OPERATION_INTENT_CODES` catalog in
`packages/operations/src/operation-intent-codes.ts`. The registry file is the registry of record for
enumerated members. `createOperation` validates stable dotted shape first, then registry membership;
unknown codes fail closed with `operation.invalid_intent`. One intent code names exactly one workflow
because intent-code identity is the ADR-0066 idempotency check. The catalog module is the enforcing
implementation and must change in lockstep with this section; this section, not the code file, is the
spec for grammar and membership rules.

## State Model

The nine-state set and the transition matrix below are normative. No Postgres enum is required —
the `operations` table `state` column is `text` — and validation is app-side: rows carrying an
unknown state are rejected when read or written. `packages/operations/src/operation-states.ts` is
the enforcing implementation and must change in lockstep with this section; this section, not the
code file, is the spec.

| State                     | Meaning                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pending`                 | Operation was created but has not begun live effects.                                                                |
| `waiting_for_human`       | Operation is blocked on Human Approval Surface or High-Assurance Challenge evidence.                                 |
| `running`                 | Operation is actively performing work.                                                                               |
| `blocked`                 | Deterministic pre-effect validation failed; no live effect was attempted.                                            |
| `incomplete`              | Live effects started or may have started, and the Operation parked with retryable or action-required remaining work. |
| `succeeded`               | Operation finished with all intended effects complete.                                                               |
| `completed_with_warnings` | Operation finished locally but left non-blocking warnings, such as Orphaned Managed Provider Copy cleanup state.     |
| `canceled`                | Operation was closed by an authorized actor without further live effects.                                            |
| `failed`                  | Operation hit a terminal implementation or integrity failure that is not safe to retry automatically.                |

Allowed transitions (a same-state write is always allowed):

| From                                                         | May move to                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `pending`                                                    | `running`, `blocked`, `canceled`, `waiting_for_human`                                                      |
| `waiting_for_human`                                          | `running`, `blocked`, `canceled`                                                                           |
| `running`                                                    | `waiting_for_human`, `blocked`, `incomplete`, `succeeded`, `completed_with_warnings`, `failed`, `canceled` |
| `blocked`                                                    | `running`, `canceled`                                                                                      |
| `incomplete`                                                 | `running`, `canceled`                                                                                      |
| `succeeded`, `completed_with_warnings`, `canceled`, `failed` | none; terminal states allow no transitions                                                                 |

Derived sets:

- Terminal: `succeeded`, `completed_with_warnings`, `canceled`, `failed`.
- Cancelable: `pending`, `waiting_for_human`, `running`, `blocked`, `incomplete`.
- Retryable: `blocked`, `incomplete`, and `waiting_for_human` once it carries cleared
  High-Assurance Challenge evidence.

`incomplete` is resumable by the same Operation ID, and `blocked` requires a new user action or
configuration change unless the caller explicitly defines an idempotent retry that repeats
pre-effect validation. A `waiting_for_human` Operation becomes resumable by the same Operation ID
only once cleared evidence is recorded, per the
[ADR-0032](adr/0032-agent-session-execution-and-step-up.md) 2026-06-12 amendment.

[ADR-0073](adr/0073-operation-execution-liveness-and-abandonment.md) pins the execution-claim rule:
every `running` Operation carries a claim — the Sync Target Serialization lease where one exists,
otherwise an `execution_deadline` recorded at the transition into `running`. The claim applies only
while `running`; a transition out of `running` sheds it. A `running` Operation whose claim has
expired is abandoned, evaluated lazily at read and claim time. An abandoned Operation is parked via
the compare-and-set `running → incomplete` arm with `cause` `retryable` and the progress flag
`abandoned`, after which the normal same-ID resume contract applies. Parking an abandoned Operation
requires the same authority as `cancelOperation`.

Implementation note: the Sync Target Serialization lease path exists, but the non-lease
`execution_deadline` claim and lazy abandonment parking are decided but not wired yet.

## Invariants

- Operation records are tenant-qualified and reachable only through the Tenant-Scoped Store.
- Operation IDs are non-secret selectors, not bearer authority.
- Every transition is compare-and-set against the current state or fencing token.
- Operation metadata is safe for agent-facing polling and must never contain Sensitive Values.
- Raw provider errors are normalized before storage; provider-native error text is not stored.
- Bounded operations used for High-Assurance Challenge cannot be broadened after the challenge is
  issued.
- A fresh `syncs run` conflicts with an open `incomplete` Operation for the same Secret Sync and
  points to the existing Operation ID.
- Sync Target Serialization leases are keyed by Organization, provider, and target identity, not by
  global provider or unrelated Sync Targets.
- A stale lease holder cannot write after losing or failing to renew the fencing token.
- Operation records reference Audit Log entries, and Audit Log entries reference Operation IDs, but
  neither duplicates Sensitive Values or decrypted Sensitive Metadata.

## Test And Release Evidence

The Interface is the test surface:

- Idempotency tests prove retried starts return the same Operation or a stable conflict without
  duplicating live effects.
- Transition tests prove stale writers cannot move an Operation backward or overwrite terminal
  state.
- Abandonment tests prove abandoned `running` Operations are reclaimable only after claim expiry
  and only via the compare-and-set `running → incomplete` parking arm.
- Metadata safety tests prove Operation records, polling output, JSON output, audit references, and
  retry hints exclude Sensitive Values, Provider Credentials, raw provider bodies, key material,
  decrypted Sensitive Metadata, and child-process environments.
- Sync lease tests prove single-target serialization, fencing-token denial for stale holders, lease
  expiry reclaim, and no global lock across unrelated targets.
- Incomplete Sync Run tests prove same-ID resume writes only pending or failed Secret Sync Bindings
  after Sync Execution Revalidation and does not rewrite confirmed bindings.
- High-Assurance Challenge tests prove bounded operation metadata cannot be broadened between
  challenge issuance and completion.
- Cancellation tests prove only authorized cancelable Operations close, live effects do not continue
  after cancellation, and existing audit evidence remains reconstructable.
