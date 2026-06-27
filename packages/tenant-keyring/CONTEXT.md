# @insecur/tenant-keyring Context

Scoped context for agents working in `packages/tenant-keyring`. This file is a reading map, not an
independent glossary. Authoritative term definitions live in the per-domain slices under
`../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns the Runtime-only composition of tenant-scoped data-key metadata access with the
crypto Keyring. It is the narrow bridge from the Tenant-Scoped Store data-key accessors to
`@insecur/crypto`, and belongs behind the Runtime Worker boundary.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../apps/runtime/CONTEXT.md`
- `../../packages/crypto/CONTEXT.md`
- `../../packages/tenant-store/CONTEXT.md`
- `../../docs/adr/0031-keyring-below-the-encryption-engine.md`
- `../../docs/adr/0064-minimize-secret-resident-surface.md`
- `../../docs/adr/0071-decrypt-egress-import-boundary.md`

## Terms To Load

- Runtime Worker
- Tenant-Scoped Store
- Organization Data Key
- Project Data Key
- Key Version
- Keyring
- Encryption Envelope
- Ciphertext Identity Binding

## Adjacent Terms

- Runtime Injection Grant Service
- Storage Security Gate
- Secret Version Store
- Audit Event Writer

## Owns

- Creating the tenant-backed Keyring from a Runtime root-key provider.
- Wiring tenant-scoped data-key metadata access into crypto's metadata data-key source.
- Keeping the crypto dependency out of public/API and contract packages.

## Does Not Own

- Public routes or API Worker composition.
- Secret Write or Injection Grant authorization.
- Tenant metadata table schemas.
- Root-key binding declaration or Cloudflare Worker environment setup.
