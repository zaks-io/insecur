# ADR-0075: Orphan Cleanup Is A New Operation

Date: 2026-06-12

Status: Accepted

## Decision

Retrying Orphaned Managed Provider Copy cleanup creates a new Operation. It never reopens the
terminal `completed_with_warnings` deletion Operation, and it never resurrects the tombstoned
Secret Sync.

This closes a promise with no legal vehicle. [docs/security-plan.md](../security-plan.md) requires
that Orphaned Managed Provider Copy cleanup "must be retryable after provider permission,
connectivity, or reauthorization problems are fixed," and the Secret Sync Deletion section of
[docs/cli-and-sync.md](../cli-and-sync.md) repeats the promise. But the deletion Operation that
created the orphan records may finish as `completed_with_warnings`, which the
[Operation Store state model](../operation-store.md) pins as terminal with no transitions and
excludes from the Retryable set (`blocked`, `incomplete`), and the tombstoned Secret Sync "cannot
run again." All three obvious vehicles — reopen the terminal Operation, `operations retry`, re-run
the sync — are each forbidden by another normative rule. This ADR supplies the fourth vehicle
without weakening any of those rules.

### The vehicle: re-invoke `syncs delete`

Re-invoking `insecur syncs delete` (or the existing
`DELETE /v1/orgs/:org/projects/:project/syncs/:sync` route) on a tombstoned Secret Sync that has
open Orphaned Managed Provider Copy records creates an orphan-cleanup Operation. There is no new CLI verb and no new route; Secret Sync Deletion is
already "the user's explicit cleanup/start-over action"
([docs/security-plan.md](../security-plan.md)), so re-invoking delete is the retry.

- **New Operation, distinct intent code.** The orphan-cleanup Operation carries the intent code
  `sync.orphan_cleanup`, distinct from the deletion Operation's intent code, recorded in the
  operation intent-code catalog in `packages/operations`. It follows the
  [ADR-0066](./0066-operation-idempotency-key-contract.md) idempotency contract unchanged: a
  retried start with the same key and intent returns the same cleanup Operation; reusing the
  original deletion's idempotency key fails with `operation.idempotency_mismatch`, which is the
  correct signal that cleanup is a different Operation.
- **Scope.** The cleanup Operation targets exactly the open Orphaned Managed Provider Copy records
  of that Secret Sync, nothing else. Re-invoking delete on a tombstoned sync with no open records
  creates no Operation and returns the already-deleted status idempotently.
- **No-reveal posture.** The cleanup Operation performs only Managed Provider Deletes, which use
  tracked provider metadata or managed-key identity, never Sensitive Values
  ([docs/security-plan.md](../security-plan.md)). It performs no Sensitive Value decrypt, no
  provider writes of values, and no provider read-back, and its warnings, progress, and audit
  output carry no Sensitive Values.
- **Serialization.** The cleanup Operation claims the same Sync Target Serialization lease keying
  as the original sync — organization, provider, target identity, with fencing-token checks before
  each provider delete, per [ADR-0057](./0057-inline-sync-execution-and-partial-failure-model.md).
  Contention fails fast as retryable `sync.target_busy`. Execution is inline and user-initiated;
  there is no background sweeper.
- **Authority.** Cleanup requires the same destructive-cleanup authority as Secret Sync Deletion,
  not Secret Sync run authority — the sync cannot run, and cleanup is the tail of the destructive
  action, not a delivery. The command keeps its existing shape: explicit destructive confirmation
  (`--confirm-delete-managed-copies`), a plan showing exactly the open records whose Managed
  Provider Deletes will be retried, and the
  [ADR-0035](./0035-display-name-resolution.md) opaque-ID rule for non-interactive callers. For
  Protected Environments, cleanup re-invocation is not a new Protected Delivery Configuration
  Change: it changes no delivery configuration and cannot exceed the Managed Provider Deletes the
  approved deletion already showed at confirmation time.
- **Outcomes.** Each record whose Managed Provider Delete succeeds becomes `cleaned`. The cleanup
  Operation ends `succeeded` when every targeted record is cleaned, or `completed_with_warnings`
  with warning code `sync.provider_delete_incomplete` when any remain open. A failed attempt keeps
  the record `open` with updated failure reason and retry state. Retrying again is another
  re-invocation creating another new Operation; the Operation state machine gains no new states and
  no new transitions.

### Orphan record lifecycle

An Orphaned Managed Provider Copy record has the lifecycle `open → cleaned | acknowledged`, with
both exit states terminal. The per-record status mirrors the per-binding
`pending → written | failed{code, retryable}` model from
[ADR-0057](./0057-inline-sync-execution-and-partial-failure-model.md): an open record carries the
failure code and retryability of its last attempted Managed Provider Delete.

`acknowledged` adjudicates the [docs/security-plan.md](../security-plan.md) language that records
"remain visible in tombstone/status/audit output until cleaned up or explicitly acknowledged": it
is a terminal state, not a display flag. Acknowledging accepts that the provider-side copy state
stays unknown — for example, the provider resource was deleted out of band or the copy was removed
manually — so it requires the same destructive-cleanup authority as the cleanup itself and records
an audit event with a reason. Acknowledged and cleaned records leave warning surfaces and future
cleanup scope but remain in tombstone and audit history. Neither terminal state ever reopens.

## Options Considered

- **A new `syncs cleanup` verb with its own route.** Rejected. The repo's standing rule is that two
  ways to do one thing is a footgun: extend the existing command rather than mint a new verb.
  Deletion is already the explicit destructive cleanup action, so a second verb would duplicate the
  delete path's confirmation, plan, authority mapping, route, and audit story while splitting "make
  the provider side clean" across two commands agents would have to choose between.
- **Make `completed_with_warnings` retryable.** Rejected. The
  [Operation Store](../operation-store.md) state model pins terminal states as allowing no
  transitions and limits the Retryable set to `blocked` and `incomplete`; the shipped enforcement
  in `packages/operations/src/operation-states.ts` and its transition tests prove terminal state
  cannot be overwritten. Reopening a terminal Operation breaks that invariant for every Operation
  consumer, not just deletion.
- **End deletion as `incomplete` so `operations retry` works.** Rejected. It contradicts the
  warnings-not-failure posture — orphan warnings "are not critical platform failures"
  ([docs/security-plan.md](../security-plan.md)) and deletion completes "with warnings rather than
  critical failure" — and the documented success contract that `operations wait` for deletion
  returns success status with warning metadata when only provider cleanup remains
  ([docs/cli-and-sync.md](../cli-and-sync.md)). It would also park deletions open indefinitely,
  since orphan records can legitimately stay open forever.
- **A background sweeper that retries orphans automatically.** Rejected for V1. Sync execution is
  inline with no queues, no dead-letter path, and no background sweeper or cron
  ([ADR-0057](./0057-inline-sync-execution-and-partial-failure-model.md)); orphan cleanup is
  user-initiated and runs inline in the triggering request like every other sync-family Operation.
- **Acknowledgment as a flag on an open record instead of a terminal state.** Rejected. An
  acknowledged-but-open record would stay in every future cleanup scope and warning surface,
  recreating one layer down the same no-exit ambiguity this ADR exists to remove.

## Consequences

- The Secret Sync Deletion retry language in [docs/cli-and-sync.md](../cli-and-sync.md) and the
  Orphaned Managed Provider Copy bullets in [docs/security-plan.md](../security-plan.md) must point
  at this mechanism — re-invoked `syncs delete`, new Operation, record lifecycle — and change
  together with this ADR. The retry-metadata promise in
  [ADR-0006](./0006-app-connections-and-secret-syncs.md) and
  [ADR-0016](./0016-delivery-first-secret-egress.md) now has its vehicle; the warning code
  `sync.provider_delete_incomplete` and existing exit codes are unchanged.
- The operation intent-code catalog in `packages/operations` gains `sync.orphan_cleanup`. The
  Operation state machine, transition matrix, and lease semantics are untouched; no schema or
  state-model change ships with this decision.
- Test evidence lands as commands inside the integration layer per
  [ADR-0065](./0065-test-layers-and-preview-smoke.md), not a new layer: re-invoked delete creates a
  new Operation while the original deletion Operation stays terminal, the tombstoned sync never
  runs, cleanup performs no decrypts and no provider value writes, lease keying serializes cleanup
  against other operations on the same target, record exits are terminal, and warning output stays
  metadata-only.
- Orphan records gain a guaranteed exit without a single change to shipped terminality rules, so an
  implementing agent no longer has to choose which normative rule to violate.
