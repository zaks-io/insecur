# @insecur/instance-bootstrap Context

Scoped context for agents working in `packages/instance-bootstrap`. This file is a
reading map, not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

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

## Claim completion contract

Bootstrap Operator Claim completion accepts a WorkOS-resolved `UserActor` from
`@insecur/auth`, not a bare target `userId`. `completeBootstrapOperatorClaim`
uses `actor.userId` as the only grant subject for Instance Operator and
first-Organization owner Membership rows. Callers must resolve the actor from
Human Identity Provider session context (INS-25); passing a separate target
user id is intentionally unsupported.

Claim consumption, verifier invalidation, `instance_operators`,
`memberships`, Effective Access validation, and required success audit events
run in one `withTenantScope` transaction via `executeBootstrapClaimInTransaction`.
Post-grant assertion or audit failures roll back the pending claim so retries do
not surface `bootstrap.already_claimed` with durable grants and no success
audit evidence.

## Does Not Own

- WorkOS hosted login UI.
- Broad public signup or signup lockdown operations.
- CLI command wiring.
- Raw SQL outside the Tenant-Scoped Store.

## Storage notes

Bootstrap/instance-scoped infrastructure tables (`instance_configurations`, `instance_identity_configurations`,
`bootstrap_operator_claims`, `instance_operators`, `bootstrap_secret_verifiers`, `user_admissions`) intentionally
have no Row-Level Security policies. They are reached only through
service-scoped Tenant-Scoped Store access; organization tenant isolation begins
at `organizations` and below.
