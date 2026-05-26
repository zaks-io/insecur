# @insecur/audit

Audit Event Writer.

This package owns metadata-only audit event writing for tenant-qualified product
events. It is separate from Audit Export integrity, which is a later module.

## Owns

- Audit event input and result shapes.
- Tenant-qualified actor, resource, request, and operation references.
- Denied-attempt audit coverage.
- Metadata allowlist rules for audit records.
- Tests that prove Sensitive Values and raw bodies are excluded.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- Tenant-Scoped Store adapter when audit rows are implemented.

## Does Not Own

- Tamper-evident Audit Export hash chains or manifests.
- Operation Store state transitions.
- Secret Version lifecycle.
- Authorization decisions.
- Sensitive Value storage.

## Interface Tests

Tests should exercise the writer Interface directly and assert stored audit
metadata. Canary-value tests should prove Sensitive Values, Provider
Credentials, raw provider bodies, and child-process environments do not appear
in audit records.

## Dependency Rule

This package may depend on `@insecur/domain`. Higher packages may consume the
Audit Event Writer, but audit writing should not call into those higher packages.

