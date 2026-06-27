# @insecur/custody-contracts Context

Scoped context for agents working in `packages/custody-contracts`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in the per-domain slices
under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task
needs.

## Role

This package owns plaintext-free custody and wrapped-material contracts shared by crypto-facing
callers. It carries metadata and type shapes across package boundaries without giving public or
store-facing packages a dependency path to the crypto implementation.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/adr/0005-key-hierarchy-and-rotation.md`
- `../../docs/adr/0026-encryption-envelope-below-per-domain-wrappers.md`
- `../../docs/adr/0031-keyring-below-the-encryption-engine.md`
- `../../docs/adr/0071-decrypt-egress-import-boundary.md`

## Terms To Load

- Organization Data Key
- Project Data Key
- Key Version
- Key Rotation
- Keyring
- Encryption Envelope
- Ciphertext Identity Binding
- Storage Security Gate

## Adjacent Terms

- Sensitive Metadata
- Provider Credential
- Tenant-Scoped Store
- Audit Event Writer

## Owns

- Data-key metadata reader/provisioner contract shapes.
- Data-key lifecycle status and root-key rewrap contract shapes.
- Wrapped Secret, Provider Credential, and Sensitive Metadata material shapes.
- Tenant data-key readiness error shared across package seams.

## Does Not Own

- Encryption, decryption, or Keyring construction (`@insecur/crypto` and `apps/runtime`).
- Root-key access or Cloudflare binding composition.
- Tenant-scoped persistence implementation.
- Secret lifecycle decisions or Runtime Injection delivery.
