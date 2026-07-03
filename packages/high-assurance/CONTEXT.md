# @insecur/high-assurance Context

Scoped context for agents working in `packages/high-assurance`. This file is a
reading map, not an independent glossary.

## Role

This package owns operation-bound High-Assurance Challenge evidence: request,
clear, validate, consume, and metadata-only status for approval policy code.

## Read First

- `../../docs/adr/0032-agent-session-execution-and-step-up.md`
- `../../docs/operation-store.md`
- `../../docs/protected-change-orchestration.md`
- `packages/auth/CONTEXT.md`
- `packages/operations/CONTEXT.md`
- `packages/audit/CONTEXT.md`

## Owns

- Challenge evidence metadata model bound to actor, tenant, project, operation,
  risk reason, expiration, and audit IDs.
- WorkOS session assurance integration for challenge clearing (reuses INS-49).
- Metadata-only challenge status for approval policy surfaces.

## Does Not Own

- Human Approval Surface UI (AUX-05 / apps/web).
- WorkOS hosted login or MFA enrollment UX.
- Operation Store persistence mechanics (`@insecur/operations`).
- Effective Access resolution (`@insecur/access`).
