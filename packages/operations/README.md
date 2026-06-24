# @insecur/operations

Operation Store and Sync Target Serialization core.

This package owns durable, metadata-only Operation state for user-visible
workflows that need status, waiting, retry, resume, or cancellation, plus the
lease rows and fencing tokens that keep at most one Secret Sync run writing to
a given Sync Target. The canonical Interface lives in
`docs/operation-store.md`.

## Owns

- Operation create, transition, progress, retry, cancel, and poll behavior.
- The idempotency key contract (unique per Organization, ADR-0066).
- Compare-and-set state transitions over the normative nine-state model.
- `blocked` and `incomplete` resume semantics.
- Sync target key validation, leases, renew/release, fencing tokens,
  stale-token rejection, and target-busy errors.
- Metadata-safe Operation progress and audit reference shapes.

## Consumes

- `@insecur/domain` for identity and result shapes.
- `@insecur/tenant-store` for scoped Operation and lease persistence.

## Does Not Own

- Provider writes, decrypt, Runtime Injection, Keyring, or Secret Version
  Store behavior.
- Authorization semantics. Callers supply resolved actor scope and the
  required Authorization Scope.
- Audit event formatting or export. Operations store audit references, not
  the Audit Log.
- Human Approval Surface UI or notification delivery.
- Queue execution. Cloudflare Queues and Durable Objects are deferred past V1.
- Sensitive Values, Provider Credentials, key material, decrypted Sensitive
  Metadata, raw provider bodies, child-process environments, or local file
  contents.

## Interface Tests

Tests should prove a retried create with the same idempotency key returns the
one matching Operation, compare-and-set transitions reject stale writers and
terminal states, leases serialize one writer per Sync Target with stale
fencing tokens rejected, and no Sensitive Value appears in Operation metadata,
progress, or error shapes.

## Dependency Rule

This package may consume lower packages. It must not import provider
adapters, `@insecur/cli`, or worker route code.
