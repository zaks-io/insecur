# @insecur/audit

Audit Event Writer for tenant-qualified, metadata-only product events. Tamper-evident
Audit Export is a later module.

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
- **Metadata-only** through allowlist validation that rejects Sensitive Value keys,
  binary payloads, and non-plain objects anywhere in the envelope, including optional
  `details` maps.

Denied security-relevant actions use explicit `*.denied` or `access.denied` event
names and always include `denial.reasonCode`. Successful actions use paired success
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

## Does Not Own

- Tamper-evident Audit Export hash chains or manifests.
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
