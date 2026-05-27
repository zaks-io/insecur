# @insecur/onboarding

Guided Organization Provisioning.

This package owns the First Value provisioning path for an admitted User:
Personal Organization, Default Team, owner Membership, first Project, and
non-protected development Environment creation.

## Owns

- Guided Organization Provisioning orchestration.
- Personal Organization creation.
- Default Team creation.
- Owner Membership creation for the admitted User.
- First Project and non-protected development Environment creation.
- Metadata-only provisioning result shapes.

## Consumes

- `@insecur/domain` for identity and result shapes.
- `@insecur/tenant-store` for scoped persistence.
- `@insecur/access` role and membership vocabulary.
- `@insecur/audit` for provisioning events and denied attempts.

## Does Not Own

- Human authentication or Human Identity Provider behavior.
- WorkOS AuthKit integration.
- Public onboarding abuse controls, rate limits, or Signup Lockdown.
- Secret writes or Runtime Injection.
- Production Delivery readiness.

## Interface Tests

Tests should prove one admitted User receives a Personal Organization, Default
Team, owner Membership, first Project, and non-protected development Environment
without needing to name every object up front. Tests should also prove the
created owner Membership resolves through the Effective Access Resolver.

## Dependency Rule

This package may compose lower packages. It must not import worker route code,
CLI command code, provider adapters, or production delivery modules.
