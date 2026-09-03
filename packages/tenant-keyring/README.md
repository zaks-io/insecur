# @insecur/tenant-keyring

Runtime-only composition of a `Keyring` over tenant-scoped Postgres data key metadata.

This package is two functions. It wires `@insecur/crypto`'s `Keyring` to the tenant-scoped
wrapped-DEK metadata in Postgres so the Runtime Worker can unwrap a tenant data key with the
instance root key.

## Owns

- `createTenantBackedKeyring`: the production composition from a `RootKeyProvider`.
- `createTenantBackedKeyringFromAccess`: the same composition over an injected metadata access,
  for tests and for callers that already hold one.

## Consumes

- `@insecur/crypto` for `Keyring`, `RootKeyProvider`, and the persisting data key source.
- `@insecur/tenant-store` for tenant-scoped data key metadata access.

## Does Not Own

- The root key itself. Only `apps/runtime` holds `INSTANCE_ROOT_KEY_V1`.
- Envelope encryption or key derivation (`@insecur/crypto`).
- Data key metadata storage mechanics (`@insecur/tenant-store`).

## Interface Tests

Covered through `@insecur/crypto` and the Runtime Worker's integration and RLS suites, which
exercise the composed keyring against real tenant-scoped Postgres.

## Dependency Rule

This package is decrypt-capable and may only be imported by the Runtime Worker deploy. The
decrypt-import lint boundary in `eslint.config.ts` enforces that no public-edge package or
`apps/api` module imports it.
