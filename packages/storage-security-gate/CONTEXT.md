# @insecur/storage-security-gate Context

Scoped context for agents working in `packages/storage-security-gate`. This file is a
reading map, not an independent glossary.

## Role

This package owns the Storage Security Gate metadata-only readiness verdict interface.
It composes readiness facts from deeper modules through injected probes and never
returns Sensitive Values, key material, or decrypted metadata.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/storage-security-gate.md`
- `../../docs/security-runbooks-and-release-gates.md`
- `../../packages/crypto/CONTEXT.md`
- `../../packages/tenant-store/CONTEXT.md`

## Terms To Load

- Storage Security Gate
- Keyring
- Tenant-Scoped Store
- No Plaintext Persistence
- Ciphertext Identity Binding

## Owns

- Gate verdict shape (`passed`, `blocked`, `unknown`).
- Stable readiness control IDs under the `storage.*` prefix.
- Metadata-only evidence references and delivery-blocking derivation.
- Readiness probe composition for production delivery checks.

## Does Not Own

- Keyring construction, encryption, or Tenant-Scoped Store implementation.
- Provider writes, Runtime Injection execution, or Secret Reveal paths.
- Release-gate bundle assembly (`@insecur/release-gate`).
