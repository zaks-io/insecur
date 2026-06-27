# @insecur/worker-kit Context

Scoped context for agents working in `packages/worker-kit`. This file is a reading map, not an
independent glossary. Authoritative term definitions live in the per-domain slices under
`../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns shared Worker composition glue for the capability-isolated deploys: HTTP
request/response helpers, public route input parsing, auth context composition, and the Runtime RPC
contract shared by `apps/api` and `apps/runtime`.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../apps/api/CONTEXT.md`
- `../../apps/runtime/CONTEXT.md`
- `../../docs/specs/deploy-route-inventory.md`
- `../../docs/adr/0062-package-seam-failures-are-errorbody-compatible.md`
- `../../docs/adr/0077-capability-isolated-worker-deploys.md`

## Terms To Load

- API Worker
- Runtime Worker
- Actor
- User
- Effective Access Resolver
- Tenant-Scoped Store
- Runtime Injection Grant Service
- Operation Store

## Adjacent Terms

- Machine Identity
- Storage Security Gate
- Secret Version Store
- Audit Event Writer

## Owns

- HTTP route helpers and domain error envelope/status mapping.
- Public route input parsing helpers.
- Auth context/admitted-user resolver composition helpers for Workers.
- Runtime RPC request/result contract shared across the Service Binding seam.

## Does Not Own

- Public route inventory or deploy placement decisions.
- Keyring construction, decrypt, or root-key bindings.
- Package domain invariants such as authorization, Secret Version append, or Injection Grant state.
- CLI command behavior.
