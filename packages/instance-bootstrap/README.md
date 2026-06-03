# @insecur/instance-bootstrap

Instance Bootstrap and Bootstrap Operator Claim completion for Production Delivery
Foundation.

## Owns

- One-time Instance initialization (Instance, Instance Configuration, Instance
  Identity Configuration, first Organization, Default Team, pending claim).
- Atomic Bootstrap Operator Claim consumption and first Instance Operator grant.
- First-Organization owner Membership creation after claim completion (grants use
  the authenticated `UserActor.userId` only).

## Consumes

- `@insecur/tenant-store` for scoped persistence.
- `@insecur/access` for post-claim Effective Access verification.
- `@insecur/audit` for metadata-only audit events.

## Does not own

- WorkOS session validation (see `@insecur/auth`).
- Guided Organization Provisioning (see `@insecur/onboarding`).
