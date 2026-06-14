# @insecur/tenant-store Context

Scoped context for agents working in `packages/tenant-store`. This file is a
reading map, not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns the Tenant-Scoped Store Interface. It concentrates scoped
transactions, tenant scope setting, and the Row-Level Security adapter contract.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/adr/0037-tenant-scoped-bound-store-over-rls.md`
- `../../docs/adr/0036-neon-postgres-over-hyperdrive-with-rls.md`
- `../../docs/storage-security-gate.md`

## Terms To Load

- Tenant-Scoped Store
- Organization
- Organization Access
- Service Access
- Opaque Resource ID
- Audit Log

## Adjacent Terms

- Storage Security Gate
- No Plaintext Persistence
- Secret-Free Logging
- Keyring
- Ciphertext Identity Binding

## Owns

- Scoped transaction Interface.
- Organization Access and Service Access store scope shapes.
- RLS-backed metadata isolation contract.
- Cross-tenant store tests.
- Plaintext Metadata Allowlist registry (`src/db/schema/plaintext-metadata-allowlist.ts`) and its Drizzle/`information_schema` conformance gates ([ADR-0070](../../docs/adr/0070-plaintext-metadata-allowlist-registry-and-conformance-gate.md)).

## Does Not Own

- Effective Access semantics.
- Business workflows.
- Encryption.
- Audit event formatting.
- Provider behavior.
