# @insecur/machine-auth Context

Scoped context for agents working in `packages/machine-auth`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns Machine Identity auth method exchange: GitHub Actions OIDC
federation, short-lived machine access token minting, trusted source matching, and
exchange audit events.

## Read First

- `../../docs/context-map.md`
- `../../docs/specs/architecture-groups.md` (AG7)
- `../../docs/context/glossary/machine-access.md`
- `../../docs/context/glossary/access-authorization.md`
- `../../docs/context/glossary/runtime-injection.md`
- `../../docs/adr/0004-machine-identities-and-ci-auth.md`
- `../../docs/adr/0029-environments-and-cd-trust-model.md`
- `../../docs/adr/0038-protected-delivery-requires-machine-credential.md`
- `../../packages/access/CONTEXT.md`

## Terms To Load

- Machine Identity
- Auth Method
- Token Scope
- Credential Scopes
- OIDC
- Machine Token

## Owns

- GitHub Actions OIDC JWT verification and claim matching.
- Short-lived machine access token format and minting.
- Trusted GitHub repository and environment constraints.
- OIDC exchange success and denial audit events.

## Does Not Own

- Human authentication (`@insecur/auth`).
- Machine Identity persistence or membership tables (`@insecur/tenant-store`).
- Effective Access resolution (`@insecur/access`).
- HTTP route/API composition (`apps/api`) or decrypt-egress RPC (`apps/runtime`).
- Environment Deploy Keys (later MAC slice).
