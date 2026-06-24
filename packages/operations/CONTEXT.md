# @insecur/operations Context

Scoped context for agents working in `packages/operations`. This file is a
reading map, not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns the Operation Store and the Sync Target Serialization core:
durable, metadata-only Operation records for user-visible workflows that need
status, waiting, retry, resume, or cancellation, plus the lease rows and
fencing tokens that serialize provider writes per Sync Target.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/operation-store.md`
- `../../docs/adr/0057-inline-sync-execution-and-partial-failure-model.md`
- `../../docs/adr/0066-operation-idempotency-key-contract.md`
- `../../docs/adr/0068-stable-dotted-code-vocabularies-in-canonical-catalogs.md`
- `../../docs/adr/0073-operation-execution-liveness-and-abandonment.md`

## Terms To Load

- Operation
- Operation Store
- Sync Target
- Sync Target Serialization
- Inline Sync Execution
- Incomplete Sync Run
- Sync Run Resume
- High-Assurance Challenge
- Tenant-Scoped Store

## Adjacent Terms

- Secret Sync
- Secret Sync Binding
- Provider Sync Overwrite
- Immediate Sync After Promotion
- Approval Request
- Human Approval Surface
- Audit Event Writer

## Owns

- Operation ID creation and tenant-qualified Operation records.
- Idempotency keys per the ADR-0066 contract.
- Metadata-only status, progress, wait, retry, and cancellation state.
- Compare-and-set state transitions that reject stale writers.
- Sync Target Serialization lease rows and fencing-token metadata.
- Bounded operation references for High-Assurance Challenge step-up flows.
- Audit references that correlate events to one Operation.
- Sync Target Serialization lease claims for sync-target operations.
- Canonical `OPERATION_INTENT_CODES` catalog and registry-membership validation in
  `createOperation`, per ADR-0068.
- Decided but not wired yet: the non-lease `execution_deadline` claim on every other `running`
  Operation and lazy abandonment recovery via the `running → incomplete` parking arm, per ADR-0073.

## Does Not Own

- Provider writes, decrypt, Runtime Injection, Keyring, or Secret Version
  Store behavior.
- Authorization semantics. Callers supply resolved actor scope.
- Audit event formatting or export.
- Human Approval Surface UI or notification delivery.
- Queue execution. Cloudflare Queues and Durable Objects are deferred past V1.
- Sensitive Values, Provider Credentials, key material, or decrypted Sensitive
  Metadata.
