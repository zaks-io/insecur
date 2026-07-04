# @insecur/app-connection Context

Scoped context for agents working in `packages/app-connection`.

## Role

This package owns the App Connection and Provider App Registration business
model used by provider sync setup flows.

## Read First

- `../../docs/adr/0006-app-connections-and-secret-syncs.md`
- `../../docs/adr/0011-provider-connection-method-matrix.md`
- `../../docs/adr/0022-per-instance-provider-app-registration.md`
- `../../docs/cli-and-sync.md` (App Connections section)
- `../tenant-store/CONTEXT.md`

## Terms To Load

- App Connection
- Provider App Registration
- Connection Method
- Provider Credential
- Provider Account Linkage
- Connection Boundary

## Owns

- Sync eligibility fail-closed guards for App Connection status.
- Metadata-safe connection and registration status projections.
- Credential attach orchestration using encrypted provider credential storage.

## Does Not Own

- Provider writes, OAuth/app-install callbacks, or provider readback.
- Secret Sync model, bindings, or execution.
- Effective Access semantics or audit formatting.
