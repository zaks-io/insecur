# @insecur/instance-bootstrap Context

Scoped context for agents working in `packages/instance-bootstrap`. This file is a
reading map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns Instance Bootstrap and Bootstrap Operator Claim completion:
instance posture records, WorkOS-ready Instance Identity Configuration, pending
operator claim CAS, Instance Operator grant, and first-Organization owner
Membership creation.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/adr/0020-instance-and-deployment-posture.md`
- `../../docs/security-plan.md`
- `packages/tenant-store/CONTEXT.md`
- `packages/access/CONTEXT.md`

## Terms To Load

- Instance Bootstrap
- Bootstrap Secret
- Bootstrap Operator Claim
- Instance Operator
- Instance Configuration
- Instance Identity Configuration
- Human Identity Provider
- Membership
- Built-In Role

## Owns

- Instance Bootstrap orchestration and persistence helpers.
- Bootstrap Operator Claim compare-and-set completion.
- Metadata-only bootstrap status and stable denial errors.
- Bootstrap audit event recording.

## Does Not Own

- WorkOS hosted login UI.
- Broad public signup or signup lockdown operations.
- CLI command wiring.
- Raw SQL outside the Tenant-Scoped Store.
