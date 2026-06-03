# @insecur/secret-store Context

Scoped context for agents working in `packages/secret-store`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns Secret Shape, Blind Secret Write, and Secret Version Store
behavior. Callers should not reimplement value validation, append/current rules,
or metadata-only write results.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/first-value-milestone.md`
- `../../docs/adr/0025-secret-version-store.md`
- `../../docs/adr/0026-encryption-envelope-below-per-domain-wrappers.md`

## Terms To Load

- Project
- Environment
- Variable Key
- Variable Key Prefix
- Secret
- Sensitive Value
- Text Secret Value
- Secret Value Size Limit
- Secret Shape
- Secret Version
- Secret Version Store
- Blind Secret Write
- Current Version
- Secret Source of Truth

## Adjacent Terms

- Draft Version
- Draft Area
- Published Version
- Promotion
- Protected Change Orchestrator

## Owns

- Text Secret Value validation.
- Blind Secret Write create-or-update behavior.
- Secret Version append and Current Version selection.
- Wrapped-material persistence rules.
- Metadata-only secret-write outputs.

## Does Not Own

- Runtime Injection Grants.
- Protected approval and Promotion.
- Provider Secret Sync.
- Raw SQL execution.
- Human authentication.
