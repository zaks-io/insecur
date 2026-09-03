# Roadmap

Last reviewed: 2026-09-03.

High-level milestone sequencing for handing implementation to a fleet of agents. This document
owns the milestone order and each milestone's exit gate, nothing else: scope boundaries are owned
by [phasing.md](phasing.md), production readiness criteria by
[production-mvp-acceptance.md](production-mvp-acceptance.md), architecture group ownership and seams
by [specs/architecture-groups.md](specs/architecture-groups.md), dependency-ordered build detail by
the Build Order in [project-status.md](project-status.md), and live status by
[project-status.md](project-status.md). Milestones overlap where noted; the exit gates do not.

## M0 — Contracts and gates before features

Goal: every cross-group agreement becomes a compile-time or CI-time fact before parallel feature
work starts, so seam divergence is caught by gates instead of review.

Scope: stable intent and error catalogs, role-bundle conformance, the Plaintext Metadata Allowlist,
the no-plaintext canary, exit/HTTP lockstep, decrypt-import boundaries, package and deploy topology
conformance, and operation liveness contracts.

Exit gate: each named gate is blocking in CI; `pnpm verify` and the DB-backed `Verify` step are
green with the new gates enabled.

## M1 — First Value complete

Goal: the copyable diskless development secret loop works end to end through ordinary commands.

Owned by [specs/first-value-ticket-plan.md](specs/first-value-ticket-plan.md) and
[first-value-milestone.md](first-value-milestone.md): Worker routes, CLI `secrets set` and `run`,
the copyable proof, and validation telemetry.

Exit gate: the First Value Proof passes end to end through `insecur secrets set --generate` plus
`insecur run`; `pnpm test:e2e` and the Preview Smoke are green.

## M2 — Local Mode

Goal: account-less development custody on the developer's machine through the ordinary CLI loop.

Owned by [adr/0080-local-mode-accountless-development-custody.md](adr/0080-local-mode-accountless-development-custody.md)
and the `Local Mode: Account-Less Development Custody` Linear project. Follows M1; useful
standalone without a Hosted Instance account. Feature ceiling: Projects and non-protected
development Environments only — no Protected Environments, Secret Sync, machine access, Teams, or
Organizations locally.

Exit gate: unauthenticated `insecur init` defaults to Local Mode; local `secrets set` / `run` work
through the real contract seams; `projects migrate` reconciles to the Hosted Instance with
verified-then-clean semantics.

## M3 — Design-partner validation

Goal: evidence that the agent-era no-reveal wedge pulls, before building the moat behind it.

Owned by the `Customer Discovery & Design Partners` Linear project (INS-3/5/6/7/8). Starts as soon
as M1 ships and runs alongside M4; it gates further feature investment, not engineering work
already in flight.

Exit gate: documented evidence review and an explicit go/no-go on the V1 scope.

## M4 — Production delivery foundation

Goal: the substrate that makes valuable secrets storable at all.

Foundation scope: full Worker composition, persisted identity and admission, production
Postgres/Hyperdrive bindings, the root-key bootstrap ceremony
(`-dev` first, per [runbooks/instance-root-key-bootstrap.md](runbooks/instance-root-key-bootstrap.md)),
key readiness enforcement, Storage Security Gate checks, and protected environment modeling.

Exit gate: the [storage-security-gate.md](storage-security-gate.md) foundation control rows have
real evidence.

## M5 — The differentiated wedge: machine access, approvals, provider sync

Goal: the capabilities that separate insecur from commodity secret managers.

Machine Identity, OIDC, and environment-scoped deploy keys (architecture group AG7); the promotion
approval state machine, High-Assurance Challenges, and the web Human Approval Surface (AG6/AG9);
then App Connections and GitHub/Cloudflare Secret Sync (AG8). Provider sync remains alpha until its
provider-level and hosted end-to-end evidence is strong enough for production use. The order is load-bearing: approval gates land
before provider sync because Approval Impact Review is the approval evidence for Cloudflare Worker
secret deploys (ADR-0039), and the protected-issuance boundary stays a scope atom, never an
actor-type branch (ADR-0038).

Exit gate: protected delivery and sync paths pass their architecture group test evidence in
[specs/architecture-groups.md](specs/architecture-groups.md).

## M6 — Small-Group Production live

Goal: first real tenants with valuable secrets.

Tamper-evident audit export and `audit verify` (ADR-0045), the backup export pipeline and
`backup_restore.export_fresh` control plus a passed restore drill (ADR-0072, ADR-0058), the
`small_group_production` runbook tier drilled (including
[runbooks/custody-material-compromise.md](runbooks/custody-material-compromise.md)), and the
release-gate evidence bundle.

Exit gate: the `small_group_production` profile in
[production-mvp-acceptance.md](production-mvp-acceptance.md) passes.

## M7 — Broad public signup and deferred promotions

Parked until explicitly promoted from the [phasing.md](phasing.md) parking lot: public onboarding
abuse controls, Signup Lockdown, Tenant Suspension, Service Access, Customer-Managed Key Custody,
Self-Hosted Instances. No work items exist for this milestone by design.

Exit gate: the `broad_public_signup` profile.

## Standing rules for the fleet

Pointers, not restatements:

- Contract-first: a PR that needs a new scope atom, error code, intent code, audit event code, or
  allowlist entry lands the registry diff first or in the same PR.
- Gates over review: when a gate blocks a correct-seeming change, the gate is the spec; change the
  ADR and doc first or fix the code ([security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md)).
- Doc conflicts resolve deterministically per the Source Of Truth Rules in
  [specs/README.md](specs/README.md) (ADR-0067).
- One-seam tickets with Linear `blocked by` graphs, per the readiness rules in
  [specs/first-value-ticket-plan.md](specs/first-value-ticket-plan.md).
