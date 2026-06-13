# @insecur/api Context

Scoped context for agents working in `apps/api`. This file is a reading map,
not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

The **API Worker** is the public caller-agnostic edge (ADR-0077). It authenticates the Actor and
composes package Interfaces into Cloudflare Worker routes. It owns transport, bindings, and request
composition, not domain invariants. It holds **no keyring**: keyring-bound work is forwarded to the
**Runtime Worker** over the `RUNTIME` Service Binding with a scoped hop token. See the deploy-topology
terms in `../../CONTEXT.md` and the route → deploy table in
`../../docs/specs/deploy-route-inventory.md`.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/architecture.md`
- `../../docs/first-value-milestone.md`
- `../../docs/specs/deploy-route-inventory.md`

## Terms To Load

- API Worker
- Runtime Worker
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
- Caller authentication and minting the scoped hop token forwarded to the Runtime Worker.
- Worker environment and binding types (no `INSTANCE_ROOT_KEY_V1`).
- Transport-level response formatting; mapping `RuntimeRpcResult` failures to error envelopes.
- Composition of package Interfaces.

## Does Not Own

- The keyring or `INSTANCE_ROOT_KEY_V1` (Runtime Worker only).
- Encryption / decryption (Runtime Worker only).
- Authorization branching (resolved Runtime-side, inside the same call that decrypts — ADR-0034).
- Raw tenant data access.
- Secret Version lifecycle.
- Runtime Injection Grant state.
- Audit metadata allowlists.
