# @insecur/audit

Audit Event Writer for tenant-qualified, metadata-only product events, plus tamper-evident
Audit Export with hash chains, HMACed manifests, and Ed25519 signatures.

## Audit event contract

Every persisted audit event is:

- **Tenant-qualified** through required `organizationId`, with optional `projectId` and
  `environmentId`. Environment-scoped events require `projectId`.
- **Actor-qualified** through `actor.type` and `actor.userId` (V1 user actors only).
- **Operation-aware** through optional `resource`, `relatedResource`, `request`, and
  `operation` references. `requestId` and `operationId` are the supported correlation
  identifiers for cross-service review.
- **Result-stable** through `outcome` (`success` | `denied`) and a stored `resultCode`.
  Successful events use `audit.succeeded`; denied events store a stable dotted denial
  code (for example `auth.insufficient_scope`), never exception text.
- **Metadata-only** through shared envelope safety rules (`FORBIDDEN_ENVELOPE_KEYS`
  denylist plus plain-object checks) that reject Sensitive Value keys, binary payloads,
  and non-plain objects anywhere in the envelope, including optional `details` maps
  persisted as JSON when present.

Denied security-relevant actions use explicit `*.denied` or `access.denied` event
names and always include `denial.reasonCode` (callers should pass a domain-stable
code; `recordActionAudit` falls back to `audit.event_invalid` when omitted).
Successful actions use paired success
event names; validation rejects outcome/event-code mismatches.

## Event code catalogs

- `FIRST_VALUE_AUDIT_EVENT_CODES` — onboarding, secret write, runtime injection, and
  access denial events from the First Value milestone.
- `PRODUCTION_AUDIT_EVENT_CODES` — sync execution, key custody, and approval workflow
  events for Production Delivery.
- `AUDIT_EVENT_CODES` — union of both catalogs for validation and writers.

Prefer domain helpers (`recordStorageAudit`, `recordSyncAudit`, `recordAccessDeniedAudit`,
`recordKeyCustodyAudit`, `recordApprovalAudit`, `recordRuntimeInjectionAudit`) or
`buildAuditEventInput` over hand-assembled payloads.

## Owns

- Audit event input and insert-row shapes.
- Tenant-qualified actor, resource, request, and operation references.
- Denied-attempt audit coverage.
- Metadata allowlist rules for audit records.
- Tests that prove Sensitive Values and raw bodies are excluded.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- Tenant-Scoped Store adapter when audit rows are persisted.

## Audit export

Tenant-bounded JSONL exports include per-entry hash chains, an HMACed manifest with key
custody evidence refs, and an Ed25519 signature over the canonicalized export bundle.
`verifyAuditExport` recomputes the chain, checks the manifest HMAC, validates the signature,
and returns metadata-only integrity results suitable for release-gate evidence.

## Does Not Own

- Operation Store state transitions.
- Authorization decisions.
- Secret Version lifecycle.
- Sensitive Value storage.

## Interface tests

Tests exercise the writer interface directly and assert stored audit metadata.
Canary-value tests prove Sensitive Values, Provider Credentials, raw provider bodies,
and child-process environments do not appear in audit records.

## Dependency rule

This package may depend on `@insecur/domain`. Higher packages may consume the Audit
Event Writer, but audit writing should not call into those higher packages.
