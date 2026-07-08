# @insecur/protected-change Context

Scoped context for agents working in `packages/protected-change`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns the Protected Change Orchestrator data model: tenant-qualified Protected
Change records, state transitions, approval evidence metadata, and authorization checks
through the Effective Access Resolver.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/protected-change-orchestration.md`
- `../../docs/adr/0017-protected-environment-promotion-and-rollback.md`
- `packages/access/CONTEXT.md`
- `packages/audit/CONTEXT.md`
- `packages/tenant-store/CONTEXT.md`

## Terms To Load

- Protected Change Orchestrator
- Promotion Change Set
- Approval Request
- Approval Impact Review Fingerprint
- Approval Impact Snapshot
- Protected Environment
- Effective Access Resolver

## Owns

- Protected Change record state machine and persistence.
- Metadata-only approval evidence rows.
- Transition authorization and audit wiring.

## Does Not Own

- Secret Version Store promotion execution.
- High-Assurance Challenge issuance.
- Web approval UI or BFF routes.
- Provider sync execution.
