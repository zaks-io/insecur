# ADR-0008: Security Gates And Runbooks

Date: 2026-05-23

Status: Accepted

insecur will treat security runbooks and release gates as product requirements, not post-launch chores. Before v1 production use, the project needs threat model review, cross-tenant authorization tests, auth/session review, key rotation and restore drills, app connection revocation tests, audit export tests, CLI non-interactive flow tests, dependency scanning, and secret scanning.

## Consequences

Security work must be captured in docs and automation. Runbooks should include dry-run, execution, verification, expected audit events, and recovery notes. A future `pnpm security:check` should provide an agent-friendly local gate mapped to OWASP ASVS, OWASP API Security Top 10, and the project's own tenant/security invariants.

The canonical runbook template, release gate profiles, evidence bundle shape, and stable control categories live in [security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).

## Amendment (2026-06-12): Runbook Catalog rows are tiered by gate profile

The Runbook Catalog in
[security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md) was written as
one flat list under "Write these before relying on insecur for valuable production secrets," yet
several rows cover surfaces the same doc's Gate Profiles table assigns to `broad_public_signup`
and the deferred scope parking lot in [phasing.md](../phasing.md) keeps out of active scope. The
runbook template requires exact dry-run, execute, and verify commands; for an unbuilt surface
those commands cannot be authored honestly, so the flat list forces an author to either fabricate
procedures or stall on a blocked gate. This amendment tiers the catalog instead.

The rule, stated so docs review can check it mechanically:

- Every Runbook Catalog row carries the gate profile that first requires it, drawn from the
  existing Gate Profiles taxonomy.
- A row's profile must match the active-scope status of its underlying product surface in the
  [phasing.md](../phasing.md) deferred scope parking lot: a runbook is required only when its
  surface is in active scope. While the surface sits in the parking lot, the row is tiered to the
  profile whose gate accompanies that surface's promotion.
- Runbooks tiered to a higher profile are visibly parked, not dropped: they become blocking when
  that profile's gate is exercised. Acceptance rows that consume the catalog, such as
  `runbook.catalog` in [production-mvp-acceptance.md](../production-mvp-acceptance.md), must keep
  that forward pointer rather than silently narrowing to the pre-production set.
- Pre-production evidence for a tiered row follows the deferred-surface pattern already in the
  Security Release Gates section of [security-plan.md](../security-plan.md): add-back-readiness,
  schema/interface compatibility, and negative evidence that no deferred surface is exposed. Full
  runbook drills become blocking when the scope decision enables the surface.

Tier assignments under this rule:

- `small_group_production` keeps First tenant bootstrap, the User and session response rows, the
  Machine and provider custody rows, the Secret lifecycle rows, the Key management rows, the
  Backup and recovery rows, the Audit and investigation rows, the Incident response row, and
  owner-initiated tenant export and deletion. The catalog preamble's "write these before
  production" requirement now binds this tier only.
- `broad_public_signup` first requires public onboarding abuse response; signup lockdown enable,
  verify, and disable; tenant suspension and reinstatement; and Service Access review. Signup
  lockdown, tenant suspension, and reinstatement are mutating Service Access controls per
  [security-plan.md](../security-plan.md), and both the Service Access surface and public
  onboarding hardening for unrelated tenants sit in the parking lot, so these runbooks cannot be
  drilled before those surfaces are active.
- The Tenant operations export-and-deletion row splits rather than staying ambiguous:
  owner-initiated tenant export and deletion is a small-group obligation and stays
  `small_group_production`; escalation from suspension to deletion is a mutating Service Access
  control per [security-plan.md](../security-plan.md) and tiers to `broad_public_signup` alongside
  the suspension runbook.

This generalizes the ADR-0019 deferral amendment's per-row "not applicable until promoted" note on
Service Access review into a catalog-wide structure derived from the phasing source of truth. The
catalog in [security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md)
carries the profile per row, the mirror inventory in [security-plan.md](../security-plan.md)
carries the same tiers, and the `runbook.catalog` acceptance wording follows; those docs and this
amendment change together. No runbook is deleted and no new gate profile or test layer is added;
the tiers reuse the Gate Profiles already defined for release evidence.
