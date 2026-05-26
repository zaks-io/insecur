# @insecur/tenant-store

Tenant-Scoped Store and metadata-store adapter contract.

This package owns the persistence seam for tenant-owned metadata. Callers should
receive a scoped callback Interface, never a raw SQL executor.

## Owns

- Scoped transaction Interface.
- Organization Access and Service Access store scope shapes.
- Transaction-local tenant scope setting.
- RLS adapter contract for Neon Postgres behind Hyperdrive.
- Cross-tenant store regression tests.

## Consumes

- `@insecur/domain` for tenant and resource identity shapes.
- A Postgres adapter implementation once persistence is implemented.

## Does Not Own

- Effective Access semantics.
- Business rules for onboarding, secrets, runtime injection, or sync.
- Encryption, Keyring, or Sensitive Value handling.
- Audit event formatting.

## Interface Tests

Tests should prove scoped reads and writes only see rows for the active
Organization Access scope, unscoped access fails closed, and Service Access
stays explicit and audited by callers.

## Dependency Rule

This package may depend on `@insecur/domain`. It must not depend on higher
domain packages such as `@insecur/secrets`, `@insecur/onboarding`, or
`@insecur/runtime-injection`.

