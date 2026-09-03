# @insecur/secret-sync Context

Scoped context for agents working in `packages/secret-sync`. This file is a
reading map, not an independent glossary.

## Role

This package owns the Secret Sync command lifecycle and the provider write adapters: the gates
that must clear before a sync runs, and the adapters that write into GitHub Actions secrets and
Cloudflare Worker secrets behind substitutable ports.

## Read First

- `../../docs/adr/0006-app-connections-and-secret-syncs.md`
- `../../docs/adr/0016-delivery-first-secret-egress.md`
- `../../docs/adr/0039-cloudflare-worker-secrets-sync-target.md`
- `../../docs/adr/0057-inline-sync-execution-and-partial-failure-model.md`
- `../../docs/adr/0038-protected-delivery-requires-machine-credential.md`
- `packages/app-connection/CONTEXT.md`
- `packages/protected-change/CONTEXT.md`

## Terms To Load

- `../../docs/context/glossary/secret-sync.md`
- `../../docs/context/glossary/project-secret-lifecycle.md`

## Adjacent Terms

- Provider connection and app registration live in `packages/app-connection/CONTEXT.md`.
- The automation verdict lives in `packages/delivery-policy/CONTEXT.md`.
- Process injection lives in `packages/runtime-injection/CONTEXT.md`.

## Owns

- Secret Sync command lifecycle: create, list, target patch, disable, run.
- Access, connection, binding, and executability assertions.
- The protected-delivery approval gate for protected Secret Sync actions.
- GitHub Actions and Cloudflare Worker adapters behind the provider lookup and write ports.
- Metadata-safe Secret Sync projections and store error mapping.

## Does Not Own

- Provider OAuth registration or installation flows (`@insecur/app-connection`).
- The delivery automation verdict (`@insecur/delivery-policy`).
- Runtime injection into a process (`@insecur/runtime-injection`).

## Plaintext Rule

`decrypt-secret-sync-write-materials` is the only decrypt-capable path and runs only inside the
Runtime Worker. A Sensitive Value must never reach a run record, audit event, or metadata-safe
projection.
