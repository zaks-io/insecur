# @insecur/worker Context

Scoped context for agents working in `apps/worker`. This file is a reading map,
not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

The Worker composes package Interfaces into Cloudflare Worker routes. It owns
transport, bindings, and request composition, not domain invariants.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/architecture.md`
- `../../docs/first-value-milestone.md`

## Terms To Load

- Actor
- User
- Organization
- Project
- Environment
- Opaque Resource ID
- Effective Access Resolver
- Tenant-Scoped Store
- Audit Event Writer
- Secret Version Store
- Runtime Injection Grant Service

## Adjacent Terms

- Storage Security Gate
- Protected Environment
- Machine Identity
- App Connection
- Secret Sync
- Operation Store

## Owns

- HTTP route shape and request parsing.
- Worker environment and binding types.
- Transport-level response formatting.
- Composition of package Interfaces.

## Does Not Own

- Authorization branching.
- Raw tenant data access.
- Encryption rules.
- Secret Version lifecycle.
- Runtime Injection Grant state.
- Audit metadata allowlists.
