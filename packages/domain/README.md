# @insecur/domain

Shared domain primitives for insecur packages.

This package is the lowest-level package in the context map. It holds shapes
that other packages need to speak the same language without importing each
other's behavior.

## Owns

- Opaque Resource ID branded types and resource identity shapes.
- Display Name and Scoped-Unique Display Name validation shapes.
- Variable Key validation shapes.
- Stable error-code and result vocabulary shared across packages.
- Metadata-only output vocabulary that is not owned by a narrower package.

## Consumes

- `CONTEXT.md` for terminology.

## Does Not Own

- Persistence or Tenant-Scoped Store behavior.
- Encryption, Keyring, or Ciphertext Identity Binding.
- Effective Access decisions.
- Secret Version lifecycle.
- Runtime Injection Grants.
- Provider adapters.

## Interface Tests

Tests should prove primitive validation and serialization behavior. This package
should not need fake adapters because it should not call outward.

## Dependency Rule

This package must not depend on another `@insecur/*` package.
