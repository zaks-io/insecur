# @insecur/domain Context

Scoped context for agents working in `packages/domain`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package holds the smallest shared domain primitives other packages need to
speak consistently without importing each other's behavior.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`

## Terms To Load

- Opaque Resource ID
- Display Name
- Scoped-Unique Display Name
- Default Display Name
- Resolved Target Echo
- Variable Key
- Variable Key Prefix
- Authorization Scope

## Adjacent Terms

- Plaintext Metadata Allowlist
- Metadata Visibility Policy
- Sensitive Metadata
- Value Length Metadata

## Owns

- Branded primitive identity shapes.
- Shared validation shapes.
- Shared stable result and error-code vocabulary when no narrower package owns
  the invariant.

## Does Not Own

- Persistence.
- Authorization resolution.
- Encryption.
- Secret lifecycle.
- Runtime Injection.
