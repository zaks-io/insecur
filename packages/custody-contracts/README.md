# @insecur/custody-contracts

Plaintext-free custody metadata and wrapped material contracts.

This package is the shared vocabulary between the public edge and the keyring holder. It
describes wrapped key material and data key lifecycle metadata without carrying, importing,
or being able to decrypt anything.

## Owns

- Wrapped material shapes for values that cross a deploy boundary while still encrypted.
- Tenant data key metadata and its lifecycle states.
- The `TenantDataKeyRewrapStore` Interface used by rewrap flows.
- Custody-contract error codes.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.

## Does Not Own

- Any encryption, decryption, wrapping, or unwrapping (`@insecur/crypto`).
- Keyring composition or root-key access (`@insecur/tenant-keyring`, `apps/runtime`).
- Storage mechanics for the metadata it describes (`@insecur/tenant-store`).

## Interface Tests

Contract shapes are exercised through the consuming packages' tests. Any test added here
must assert shape and lifecycle rules only; a test that needs a real key belongs in
`@insecur/crypto`.

## Dependency Rule

This package may depend only on `@insecur/domain`. It is on the public/contract side of the
package-boundary conformance gate and must never enter the crypto graph.
