# ADR-0066: Operation Idempotency Key Contract

Date: 2026-06-11

Status: Accepted

## Decision

The Operation Store's idempotency key contract is pinned as follows:

- An idempotency key is unique per Organization, matching the shipped
  `operations_org_idempotency_key_idx` partial unique index on `(org_id, idempotency_key)` where
  the key is non-null. Uniqueness is not scoped to the intent code, because an
  organization-plus-intent scope would let the same key with a different intent silently create a
  second Operation and make the mismatch below undetectable.
- A retried `createOperation` with the same key and the same intent code returns the existing
  Operation with `created=false`. This is the idempotent-retry path and creates nothing.
- The same key with a different intent code fails with the stable error code
  `operation.idempotency_mismatch`, added to `OPERATION_ERROR_CODES`. The code maps to the CLI
  conflict exit code `6` in [docs/cli-and-sync.md](../cli-and-sync.md).
- Payload or progress differences alone are not a mismatch in V1. Intent-code identity is the
  normative check; two requests with the same key and intent code are the same Operation even if
  their metadata-only progress differs.
- Retention is explicit: there is no separate key expiry in V1. The idempotency key lives exactly
  as long as the Operation row it is stored on.

## Options Considered

- **Uniqueness scoped to organization plus intent code.** Rejected. Same key, different intent
  would silently mint a second Operation instead of surfacing a conflict, hiding caller bugs the
  mismatch error exists to catch.
- **Payload-level mismatch detection.** Deferred. Comparing progress or payload across retries
  adds canonicalization complexity for no V1 caller; intent-code identity is the normative minimum
  and can be tightened later without breaking the contract.
- **TTL-based key expiry.** Rejected for V1. A separate expiry window invites a retried request to
  create a duplicate Operation after the window closes; tying the key's lifetime to the Operation
  row keeps retry semantics deterministic.

## Consequences

- [docs/operation-store.md](../operation-store.md) carries this contract as the Operation Store's
  idempotency key subsection; the doc and this ADR must change together.
- `packages/operations/src/insert-operation-row.ts` currently returns the existing row for a
  matching key regardless of `intent_code`, so the mismatch check is not yet enforced. Enforcing
  `operation.idempotency_mismatch` in the `createOperation` resolve path and adding a
  same-key-different-intent integration test are tracked by a follow-up ticket.
