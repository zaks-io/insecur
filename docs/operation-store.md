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
- `cancelOperation(operationId)` closes a cancelable Operation through compare-and-set state.

The exact function names can differ. The required Interface shape is one Operation ID, explicit
state transitions, metadata-only progress, idempotent retries, and no access to private workflow
implementation tables by callers.

## State Model

State names are documentation vocabulary, not a required database enum:

| State | Meaning |
| --- | --- |
| `pending` | Operation was created but has not begun live effects. |
| `waiting_for_human` | Operation is blocked on Human Approval Surface or High-Assurance Challenge evidence. |
| `running` | Operation is actively performing work. |
| `blocked` | Deterministic pre-effect validation failed; no live effect was attempted. |
| `incomplete` | Live effects started and the Operation parked with retryable or action-required remaining work. |
| `succeeded` | Operation finished with all intended effects complete. |
| `completed_with_warnings` | Operation finished locally but left non-blocking warnings, such as Orphaned Managed Provider Copy cleanup state. |
| `canceled` | Operation was closed by an authorized actor without further live effects. |
| `failed` | Operation hit a terminal implementation or integrity failure that is not safe to retry automatically. |

Terminal states do not return to `running`. `incomplete` is resumable by the same Operation ID, and
`blocked` requires a new user action or configuration change unless the caller explicitly defines an
idempotent retry that repeats pre-effect validation.

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
