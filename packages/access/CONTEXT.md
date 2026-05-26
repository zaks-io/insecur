# @insecur/access Context

Scoped context for agents working in `packages/access`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns the Effective Access Resolver. Callers provide an actor and
resource coordinate; this package returns coordinate-bound Effective Access.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/adr/0034-effective-access-resolver.md`
- `../../docs/first-value-milestone.md`

## Terms To Load

- Actor
- User
- Agent
- Membership
- Effective Access
- Effective Access Resolver
- Authorization Scope
- Scope-First Authorization
- Role
- Built-In Role
- Approval Role
- Metadata Viewer Role
- Team
- Default Team
- Credential Scopes

## Adjacent Terms

- Organization Access
- Service Access
- Protected Environment
- Protected Approval Policy
- Machine Identity

## Owns

- Membership and Role expansion into Effective Access.
- Built-In Role scope bundles.
- Credential Scopes interpretation when machine access lands.
- Cross-tenant authorization regression tests.

## Does Not Own

- Human authentication.
- Service Access authorization.
- Protected approval and Promotion.
- Tenant-Scoped Store transaction mechanics.
- Route-level not-found behavior.

