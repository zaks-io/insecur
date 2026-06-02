# ADR-0063: Guided Provisioning Creates, Does Not Reconcile

Date: 2026-06-02

Status: Accepted

## Decision

`provisionGuidedOrganization` is a create-only flow: admit guard, mint opaque resource IDs, persist the First Value tenant shape in one `withTenantScope` transaction, assert owner scopes once, and record success audit. Every call creates a new Organization (plus Default Team, owner Membership, first Project, and non-protected development Environment). A user may own many Organizations on an Instance; there is no identity-based idempotency and no deny-when-the-user-already-owns-an-org check.

When the caller supplies client-minted `resourceIds`, a reused ID that already exists in the tenant surfaces as `onboarding.resource_conflict` (a clean conflict), not resolve-to-existing. This follows the create half of [docs/cli-and-sync.md](../cli-and-sync.md) lines 174–178: client-minted IDs are the natural creation idempotency key, but a retried create with the same ID resolves to the same resource **or a clean conflict**; guided provisioning takes the clean-conflict branch.

This refines [ADR-0040](0040-guided-personal-organization-provisioning.md): Personal Organizations remain ordinary Organizations that grow into team orgs; provisioning no longer reconciles against prior owner memberships or reloads an existing shape on unique violations.

## Options Considered

- **Deny when the user already has an owner Organization.** Rejected. Contradicts multi-org ownership and smears provisioning correctness across advisory reads outside the create transaction.
- **Identity-based idempotency (reload existing shape on retry or 23505).** Rejected. Hides partial-failure states and couples retries to cross-transaction reads instead of DB uniqueness.
- **Create-only with clean conflict on reused client-minted IDs.** Accepted. Local correctness rests on insert + one tenant-scoped transaction; tests cover create-success, reused-id conflict, and not-admitted denial.

## Consequences

- `findExistingOwnerOrganization`, `loadExistingGuidedOrganizationShape`, deny-when-exists, and idempotent-resolve paths are removed from `@insecur/onboarding`.
- Sequential provisions without `resourceIds` mint fresh IDs and produce distinct Organizations.
- `recordProvisionDenied` is removed; conflict paths do not write audit into unrelated tenants.
- Integration tests assert create-success, multi-org creation, reused-id conflict, admission gate, and cross-tenant audit safety on conflict.
