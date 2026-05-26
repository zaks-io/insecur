# @insecur/audit Context

Scoped context for agents working in `packages/audit`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns the Audit Event Writer for tenant-qualified, metadata-only
product events. Tamper-evident Audit Export is a later module.

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

- Audit event input and result shapes.
- Tenant-qualified actor, resource, request, and operation references.
- Denied-attempt audit coverage.
- Audit metadata allowlist tests.

## Does Not Own

- Audit Export hash chains or manifests.
- Operation Store state.
- Authorization decisions.
- Secret Version lifecycle.
- Sensitive Value storage.

