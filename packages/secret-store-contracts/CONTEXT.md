# @insecur/secret-store-contracts Context

Scoped context for agents working in `packages/secret-store-contracts`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in the per-domain slices
under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task
needs.

## Role

This package owns public-safe Secret Write validation and error contracts that callers can use
without importing Secret Version Store behavior or the crypto graph.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/first-value-milestone.md`
- `../../docs/adr/0025-secret-version-store.md`
- `../../docs/adr/0026-encryption-envelope-below-per-domain-wrappers.md`

## Terms To Load

- Variable Key
- Variable Key Prefix
- Secret
- Sensitive Value
- Text Secret Value
- Secret Value Size Limit
- Secret Shape
- Blind Secret Write

## Adjacent Terms

- Secret Version
- Secret Version Store
- Current Version
- Local Secret File
- Runtime Injection

## Owns

- Safe Sensitive Value ingress guardrails for write requests.
- Text Secret Value byte/UTF-8 validation.
- Variable Key write validation.
- Secret Write error class used by public/package-facing callers.

## Does Not Own

- Secret Version append/current persistence (`@insecur/secret-store`).
- Encryption or keyring access.
- Tenant-Scoped Store transactions.
- Runtime Injection Grants or provider sync.
