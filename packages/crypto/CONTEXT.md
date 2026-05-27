# @insecur/crypto Context

Scoped context for agents working in `packages/crypto`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns tenant-bound cryptography below higher product workflows. It
returns wrapped material and readiness facts, not plaintext persistence
shortcuts.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/adr/0005-key-hierarchy-and-rotation.md`
- `../../docs/adr/0026-encryption-envelope-below-per-domain-wrappers.md`
- `../../docs/adr/0031-keyring-below-the-encryption-engine.md`
- `../../docs/storage-security-gate.md`

## Terms To Load

- Organization Data Key
- Project Data Key
- Key Version
- Key Rotation
- Customer-Managed Key Custody
- Custody-Locked Organization
- Keyring
- Encryption Envelope
- Ciphertext Identity Binding

## Adjacent Terms

- Sensitive Metadata
- Sensitive Metadata Encryption
- Provider Credential
- Storage Security Gate

## Owns

- Keyring Interface.
- Encryption Envelope behavior.
- Key Version and key lifecycle shapes.
- Ciphertext identity binding.
- Cross-tenant key and ciphertext mis-binding tests.

## Does Not Own

- Secret Version append/current lifecycle.
- Tenant-Scoped Store transactions.
- Runtime Injection.
- Secret Sync.
- Audit event formatting.
