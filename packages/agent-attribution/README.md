# @insecur/agent-attribution

Agent harness detection and Agent Session attribution for actor context.

This package answers "which agent, under which human, in which harness" for audit and
`whoami` surfaces. It resolves an attribution tier from a registered Agent Session, never
from caller-supplied claims alone.

## Owns

- The known harness marker catalog and environment-based harness detection.
- Derived harness name validation for caller-supplied harness codes.
- Agent Session registration, lookup, and ancestry keys for nested agent runs.
- Attribution tier resolution and the `whoami` attribution/context field projections.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/access` for the Effective Access of the acting principal.
- `@insecur/tenant-store` for tenant-scoped Agent Session persistence.

## Does Not Own

- Human authentication or session minting (`@insecur/auth`).
- Audit event persistence (`@insecur/audit`).
- The CLI commands or route handlers that surface attribution.

## Interface Tests

Tests assert the resolved attribution tier and the projected `whoami` fields for stored
Agent Sessions, including nested ancestry. Integration tests cover the tenant-scoped store
path. Harness detection is tested through `detectHarnessFromEnv` rather than through callers.

## Dependency Rule

This package may depend on `@insecur/domain`, `@insecur/access`, and a Tenant-Scoped Store
Interface. It never handles Sensitive Values and never exposes raw store handles.
