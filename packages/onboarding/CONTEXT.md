# @insecur/onboarding Context

Scoped context for agents working in `packages/onboarding`. This file is a
reading map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns Guided Organization Provisioning for First Value: Personal
Organization, Default Team, owner Membership, first Project, and non-protected
development Environment creation for an admitted User.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/first-value-milestone.md`
- `../../docs/adr/0040-guided-personal-organization-provisioning.md`

## Terms To Load

- Actor
- User
- Organization
- Personal Organization
- Guided Organization Provisioning
- Bounded Onboarding
- Public Onboarding
- Membership
- Role
- Built-In Role
- Team
- Default Team
- Project
- Environment
- Default Display Name

## Adjacent Terms

- Instance
- Instance Configuration
- Instance Identity Configuration
- Instance Operator
- Bootstrap Secret
- Bootstrap Operator Claim
- Instance Bootstrap

## Owns

- Guided Organization Provisioning orchestration.
- Personal Organization creation.
- Default Team creation.
- Owner Membership creation.
- First Project and non-protected development Environment creation.
- Metadata-only provisioning outputs.

## Does Not Own

- WorkOS AuthKit.
- Human authentication.
- Public onboarding abuse controls.
- Secret writes.
- Runtime Injection.
- Production Delivery readiness.
