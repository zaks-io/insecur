# Roadmap

Last updated: 2026-06-27.

High-level milestone sequencing for handing implementation to a fleet of agents. This document
owns the milestone order and each milestone's exit gate, nothing else: scope boundaries are owned
by [phasing.md](phasing.md), production readiness criteria by
[production-mvp-acceptance.md](production-mvp-acceptance.md), workstream ownership and seams by
[specs/agent-workstreams.md](specs/agent-workstreams.md), dependency-ordered build detail by the
Build Order in [project-status.md](project-status.md), and live status by
[project-status.md](project-status.md). Milestones overlap where noted; the exit gates do not.

## M0 — Contracts and gates before features

Goal: every cross-workstream agreement becomes a compile-time or CI-time fact before parallel
feature work starts, so seam divergence is caught by gates instead of review.

- The enforcement code from the 2026-06-12 ADR batch is landed and blocking in CI: the
  `OPERATION_INTENT_CODES` catalog and membership validation (ADR-0068), the
  `operation.idempotency_mismatch` check (ADR-0066), the role-bundle registry conformance suite
  (ADR-0034) including the machine-only `runtime_injection:grant_issue_protected` atom
  (ADR-0038), the Plaintext Metadata Allowlist registry and conformance gate (ADR-0070), the
  no-plaintext canary gate `pnpm test:canary` (ADR-0069), the exit/HTTP lockstep test
  (ADR-0062), the decrypt-import lint boundary (ADR-0071), and non-lease `execution_deadline`
  claims with lazy abandonment recovery (ADR-0073, INS-219).
- Close the custody and persistence gaps already ticketed: Cloudflare Secrets Store keyring
  wiring (INS-145/147/149/150), wrapped data keys plus the rewrap primitive (INS-160), and the
  Hyperdrive runtime pool (INS-162).

Exit gate: each named gate is blocking in CI; `pnpm verify` and the `postgres-integration` job are
green with the new gates enabled.

## M1 — First Value complete

Goal: the copyable diskless development secret loop works end to end through ordinary commands.

Owned by [specs/first-value-ticket-plan.md](specs/first-value-ticket-plan.md) and
[first-value-milestone.md](first-value-milestone.md): remaining Worker route/profile hardening,
the copyable proof (INS-1), and validation telemetry (INS-4). Baseline CLI `secrets set`, `run`,
and masked secret input are landed (INS-32, INS-33, INS-226).

Exit gate: the First Value Proof passes end to end through `insecur secrets set --generate` plus
`insecur run`; `pnpm test:e2e` and, once enabled, the preview smoke are green.

## M2 — Design-partner validation

Goal: evidence that the agent-era no-reveal wedge pulls, before building the moat behind it.

Owned by the `Customer Discovery & Design Partners` Linear project (INS-3/5/6/7/8). Starts as soon
as M1 ships and runs alongside M3; it gates further feature investment, not engineering work
already in flight.

Exit gate: documented evidence review and an explicit go/no-go on the V1 scope.

## M3 — Production delivery foundation

Goal: the substrate that makes valuable secrets storable at all.

Per the Build Order in [project-status.md](project-status.md): full Worker composition, persisted
identity and admission, production Postgres/Hyperdrive bindings, the root-key bootstrap ceremony
(`-dev` first, per [runbooks/instance-root-key-bootstrap.md](runbooks/instance-root-key-bootstrap.md)),
key readiness enforcement, Storage Security Gate checks, and protected environment modeling.

Exit gate: the [storage-security-gate.md](storage-security-gate.md) foundation control rows have
real evidence.

## M4 — The differentiated wedge: machine access, approvals, provider sync

Goal: the capabilities that separate insecur from commodity secret managers.

Machine Identity, OIDC, and environment-scoped deploy keys (W7); the promotion approval state
machine, High-Assurance Challenges, and the web Human Approval Surface (W6/W9); then App
Connections and GitHub/Cloudflare Secret Sync (W8). The order is load-bearing: approval gates land
before provider sync because Approval Impact Review is the approval evidence for Cloudflare Worker
secret deploys (ADR-0039), and the protected-issuance boundary stays a scope atom, never an
actor-type branch (ADR-0038).

Exit gate: protected delivery and sync paths pass their workstream test evidence in
[specs/agent-workstreams.md](specs/agent-workstreams.md).

## M5 — Small-Group Production live

Goal: first real tenants with valuable secrets.

Tamper-evident audit export and `audit verify` (ADR-0045), the backup export pipeline and
`backup_restore.export_fresh` control plus a passed restore drill (ADR-0072, ADR-0058), the
`small_group_production` runbook tier drilled (including
[runbooks/custody-material-compromise.md](runbooks/custody-material-compromise.md)), and the
release-gate evidence bundle.

Exit gate: the `small_group_production` profile in
[production-mvp-acceptance.md](production-mvp-acceptance.md) passes.

## M6 — Broad public signup and deferred promotions

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
