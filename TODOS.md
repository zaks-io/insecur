# TODOS

Build-actionable tasks from the 2026-05-25 CEO scope review (SCOPE REDUCTION within the
committed production spine). Scope cut-lines live in [docs/phasing.md](docs/phasing.md); this
file is the action list. When a task lands, move its outcome into the relevant spec and check
it off here.

Verdict from the review: the reduced scope is sound as direction, but #1 through #4 must close
before implementation starts.

## P1 — Close before implementation starts

- [ ] **#1 Reconcile docs to the reduced V1.** Record the cut-lines in `docs/phasing.md` (done
  in this pass) and resolve the four stale ADR contradictions with explicit superseded-by notes
  so a doc-driven build never targets a retired decision:
  - 0002 vs 0036 (0002 says "no Postgres"; 0036 makes Neon a hard dependency)
  - 0023 vs 0039 (0023 CF Secrets Store sync superseded; 0006/0011/0027 still reference the old model)
  - 0014 vs 0045 (0014 defers Ed25519; 0045 pulls it into V1)
  - 0017 vs 0033 (0017 implies two human actions; 0033 says one gate)
  - _Effort: S. Depends on: nothing._

- [ ] **#2 Design the inline-sync partial-failure state machine** before any sync code. The
  All-Or-Nothing Sync Pre-Write Gate is pre-write only; it does not cover a provider 5xx on
  binding k of n after writes have started. Deferring Cloudflare Queues removed the dead-letter
  net, so the inline path must: persist per-binding write status on the operation record, hold
  the per-target advisory lock with a timeout, make retry idempotent (re-runnable by operation
  ID, re-writes only unconfirmed bindings), and surface a visible `partial — N of M written,
  retry <op-id>` state in audit and CLI. Name the Cloudflare-Worker case explicitly: a Worker
  secret write is a production deploy, so a partial run leaves a Worker in an indeterminate
  production state. _Effort: M. Depends on: #1. Sources: Finding 4, Outside Voice._

- [ ] **#3 Pull a minimal backup + tested restore into V1 (CRITICAL).** Define RTO/RPO and run
  one rehearsed restore drill for the root-key custody material and the Neon metadata store. A
  custodian that loses either is unrecoverable for tenants. `docs/open-questions.md` already says
  this must not sit in the post-v1 hardening bucket; the reduction did not change that.
  _Effort: M. Depends on: storage baseline / Storage Security Gate work._

- [ ] **#4 Write the AUP clickwrap + onboarding attestation** before the first non-founder user.
  The regulated-industry exclusion (ADR-0047) only holds if it is enforced at onboarding; the
  clickwrap is unwritten counsel work today. _Effort: S (counsel). Depends on: before first
  external user, not before code._

## P2 — Build-time correctness

- [ ] **#5 Atomic single-consumption on the Bootstrap Operator Claim** (CONTEXT.md:97-99). Spec
  says "one-time" but not how; two racing claimants both becoming first Instance Operator is
  privilege escalation. Use a unique constraint or compare-and-swap on claim consumption.
  _Effort: S._

- [ ] **#6 Enumerate `injection.*` error codes** for `run`: `injection.grant_denied`,
  `injection.decrypt_failed`, `injection.unreachable`. All fail-closed, no stale cached secret.
  _Effort: S._

- [ ] **#7 Build the Effective Access Resolver as set-based queries** (CONTEXT.md:180). It unions
  org-tier and project-tier grants per requested Opaque Resource ID; per-ID lookups are an N+1 on
  every authorization check. _Effort: S/M._

- [ ] **#9 Keep the deferred layers add-back-ready.** Hold the Approval Request data model
  batch-ready and the Protected Approval Policy threshold generalizable (count approvals,
  threshold = 1 now) so Staged Change Set and multi-approver drop in later without a migration.
  _Effort: S (design constraint, ongoing)._

## Before Production Delivery ships

- [ ] **#8 Write the Incident Response runbook**, starting with the "tenant reports a compromised
  secret" path. No code; table stakes for a secrets custodian. `docs/open-questions.md` flags it
  as not yet thought through. _Effort: S. Depends on: nothing._

## Business

- [ ] **#10 Model unit economics against a realistic automation profile** before pricing is
  load-bearing. The "robots free" promise (machines unmetered) sits against automation-driven
  Cloudflare cost; no cut in this review addresses it, and `docs/research/unit-economics.md` is a
  stub. _Effort: M. Depends on: a real automation usage sample (ideally from V1 dogfooding)._

## Deferred scope (tracking only — see docs/phasing.md for rationale)

Vercel sync adapter; Cloudflare Queues + Durable Objects; automated key-rotation engine; Service
Access surface; Staged Change Set / batch publish; multi-approver + Partial Approvals; full web
management parity. All deferrals are additive (reversibility 4-5) because the vendor ports
(ADR-0049), versioned policy, operation/audit model, and `key_version` schema seams already
exist.
