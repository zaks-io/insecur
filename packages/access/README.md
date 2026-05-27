# @insecur/access

Effective Access and scope-first authorization.

This package owns the Effective Access Resolver Interface described in
`CONTEXT.md` and ADR-0034. Routes, command handlers, and workflow modules should
ask this package for Effective Access, then check the required Authorization
Scope against the returned set.

## Owns

- Membership and Role expansion into Effective Access.
- Built-In Role to Authorization Scope mapping.
- Credential Scopes evaluation for machine actors when machine access lands.
- Coordinate-bound Authorization Scope sets.
- Cross-tenant authorization regression tests for the resolver.

## Consumes

- `@insecur/domain` for resource identity, result, and error-code shapes.
- Tenant-owned Membership and Role reads through a Tenant-Scoped Store adapter
  once implemented.

## Does Not Own

- Human authentication or Human Identity Provider behavior.
- Service Access.
- Protected Environment approval, Promotion, or High-Assurance Challenge rules.
- Raw SQL or tenant scope setting.
- Route-level 404 handling or slug lookup.

## Interface Tests

Tests should assert the resolved Effective Access set for stored Memberships,
Roles, Teams, and machine credentials. The returned set is the test surface; do
not test private helper branches through route behavior.

## Dependency Rule

This package may depend on `@insecur/domain`. It may consume a
Tenant-Scoped Store Interface without exposing raw store handles to callers.
