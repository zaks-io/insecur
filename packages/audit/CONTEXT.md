# @insecur/audit Context

Scoped context for agents working in `packages/audit`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns the Audit Event Writer for tenant-qualified, metadata-only
product events and tamper-evident Audit Export (hash chains, manifests, verify).

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/architecture.md`
- `../../docs/security-runbooks-and-release-gates.md`

## Terms To Load

- Audit Log
- Audit Event Writer
- Actor
- Organization
- Project
- Environment
- Opaque Resource ID
- Plaintext Metadata Allowlist
- Secret-Free Logging
- Sensitive Metadata

## Adjacent Terms

- Audit Export
- Breach Forensic Record
- Security Evidence Bundle

## Owns

- Audit event input and insert-row shapes.
- Tenant-qualified actor, resource, request, and operation references.
- Denied-attempt audit coverage.
- Audit metadata allowlist tests.
- Tamper-evident audit export, hash chains, HMACed manifests, and `verifyAuditExport`.

## Does Not Own

- Operation Store state.
- Authorization decisions.
- Secret Version lifecycle.
- Sensitive Value storage.
