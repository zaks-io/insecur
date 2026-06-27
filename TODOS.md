# TODOS

Build-actionable tasks from the 2026-05-25 CEO scope review (SCOPE REDUCTION within the
committed production spine). Scope cut-lines live in [docs/phasing.md](docs/phasing.md); this
file is the action list. When a task lands, move its outcome into the relevant spec and check
it off here.

Verdict from the review: the reduced scope is sound as direction. Of the four pre-implementation
blockers, #1 and #2 are now closed (see [Closed](#closed-landed-in-specsadrs)); #3 and #4 remain.

## P1 — Close before implementation starts

- [ ] **#3 Minimal backup + tested restore (CRITICAL). Model resolved 2026-05-25 grill; drill is
      a pre-production gate.** A custodian that loses the root-key custody material or the Neon
      metadata store is unrecoverable for tenants, and `docs/open-questions.md` forbade deferring this
      to post-v1 hardening. Resolved model (ADR-0058, security-plan.md §8):
  - **Three scenarios, three mechanisms:** Neon native PITR with 7-day retention (corruption /
    accidental delete, account intact; RPO ~0, RTO minutes); one daily independent encrypted
    logical export to R2 under the existing custody-chain key (Neon-account loss; RPO 24h, RTO
    same business day, manual); ADR-0028 offline escrow (root-key loss; RPO 0, RTO a few hours).
  - **Targets are internal best-effort, not customer SLAs.**
  - **No separate backup key in V1** — the R2 export reuses the root key, so the escrow already
    protects it and the Neon-loss and root-key-loss drills collapse into one rehearsal.

  Remaining, gated on the storage baseline existing (do before the first valuable production
  secret, alongside the Storage Security Gate): build the daily R2 export job; create a recovery
  canary (sentinel org/project/secret, known plaintext); run one end-to-end restore drill (fresh
  Neon ← latest export, escrowed key → fresh Secrets Store, decrypt the canary to its expected
  value); record the measured RTO; fill the "Neon Postgres restore from encrypted backup" runbook.
  _Effort: M. Depends on: storage baseline / Storage Security Gate work._

- [ ] **#4 Write the AUP clickwrap + onboarding attestation** before the first non-founder user.
      The regulated-industry exclusion (ADR-0047) only holds if it is enforced at onboarding; the
      clickwrap is unwritten counsel work today. _Effort: S (counsel). Depends on: before first
      external user, not before code._

## P2 — Build-time correctness

- [ ] **#9 Keep the deferred layers add-back-ready.** Hold the Approval Request data model
      batch-ready and the Protected Approval Policy threshold generalizable (count approvals,
      threshold = 1 now) so Staged Change Set and multi-approver drop in later without a migration.
      _Effort: S (design constraint, ongoing)._

## Business

- [ ] **#10 Re-run unit economics against a measured automation profile** before pricing is
      load-bearing. The "robots free" promise (machines unmetered) sits against automation-driven
      Cloudflare cost. The rough model v0 exists (`docs/research/unit-economics.md`); what remains
      is re-running it with real automation usage. _Effort: M. Depends on: a real automation usage
      sample (ideally from V1 dogfooding)._

## Closed (landed in specs/ADRs)

- [x] **#1 Reconcile docs to the reduced V1.** All four stale ADR pairs resolved: 0002→0036 (Neon)
      and 0014→0045 (Ed25519 in V1) carry Status amendment notes; 0023→0039 (Cloudflare sync target)
      is superseded with 0006/0011 in-part notes; 0017→0033 (one logical publish gate) now
      cross-references ADR-0033. The retired Queues/Durable-Objects sync runtime was swept to Inline
      Sync Execution (ADR-0057) across architecture.md, security-plan.md, cli-and-sync.md,
      protected-change-orchestration.md, project-status.md, phasing.md, and ADR-0016/0025/0027/0051.

- [x] **#5 Atomic single-consumption on the Bootstrap Operator Claim.** Mechanism landed in
      `@insecur/instance-bootstrap` via INS-47 (core CAS claim + partial unique indexes, #20),
      hardened by INS-108 (authenticated actor) and INS-109 (rollback regression coverage, #40).
      Covered by `packages/instance-bootstrap/test/bootstrap-operator-claim.integration.test.ts`
      including the duplicate-claim `bootstrap.already_claimed` path; on-win Bootstrap Secret
      invalidation lands in `apply-bootstrap-grants-in-transaction.ts`. Design record: ADR-0027's
      CAS + partial-unique-index paragraph (stated there via Injection Grant consumption and the
      single-pending-Approval-Request invariant) and the `@insecur/instance-bootstrap` entry in
      [docs/project-status.md](docs/project-status.md) ("pending claim CAS").

- [x] **#2 Inline-sync partial-failure state machine.** Design + reconciliation done. ADR-0057
      supersedes ADR-0012/0013 and amends ADR-0039; CONTEXT.md carries the four glossary terms
      (Inline Sync Execution, Incomplete Sync Run, Sync Run Resume, Sync Target Serialization); the
      old queue/Durable Object sync runtime prose in cli-and-sync.md and architecture.md is rewritten
      to the inline model (lease-row serialization with a fencing token, `blocked`/`incomplete` operation
      states, same-op resume, no dead-letter).

- [x] **#6 Enumerate `injection.*` error codes** — written into cli-and-sync.md Runtime Injection:
      `grant_denied` (exit 4), `command_fingerprint_mismatch` (2), `decrypt_failed` (1),
      `grant_expired` (6), `unreachable` (8); all fail-closed (child never starts), no stale-secret
      fallback by construction.

- [x] **#7 Effective Access Resolver as set-based queries** — contract recorded in ADR-0034
      Consequences: one batch read unions org-tier and project-tier grants (`project_id = ANY($ids)`),
      request-scoped membership memo never cached across requests, machine path already O(1), and a
      round-trip-count test asserts resolving N resource IDs costs one read.

- [x] **#8 Incident Response runbook: "tenant reports a compromised secret" path designed.**
      Resolved in [ADR-0059](docs/adr/0059-tenant-reported-secret-compromise-response.md) and the
      Runbook Catalog + invariants in
      [security-runbooks-and-release-gates.md](docs/security-runbooks-and-release-gates.md): one
      triage-and-route entry runbook, tenant-side rotation by default with a four-signal escalation to
      the custody-material compromise + ADR-0048 forensic path, two-column containment (insecur
      delivery-side vs the tenant's upstream-revocation step it cannot execute), and Leak Verification
      deferred (no stored hash index; decrypt-on-demand if ever built). Residual is build-gated, not
      design: fill the exact execute/verify commands when the rotation CLI/API surface exists and run a
      triage tabletop before the first valuable production secret (Small-Group Production gate).

## Deferred scope

The deferred-scope source of truth is
[docs/phasing.md#deferred-scope-parking-lot](docs/phasing.md#deferred-scope-parking-lot). Do not
create Linear projects, project milestones, parent issues, implementation issues, or placeholder
tickets for anything listed there until it is promoted out of the deferred parking lot in the repo
docs.
