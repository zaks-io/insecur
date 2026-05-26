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

- [ ] **#2 Inline-sync partial-failure state machine. Design resolved 2026-05-25 grill;
  reconciliation work remains.** The All-Or-Nothing Sync Pre-Write Gate is pre-write only; it
  does not cover a provider 5xx on binding k of n after writes have started, and deferring
  Cloudflare Queues removed the dead-letter net. Resolved design:
  - **Inline Sync Execution**, no queue/cron. Transient provider errors (503/429/timeout/reset)
    retry in-request with backoff and honor `Retry-After`; user-actionable errors (reauth,
    drift, 4xx validation, boundary mismatch, value-too-large) stop and surface the remedy.
  - **Cloudflare stages all bindings into one new Worker version and deploys once**, so it never
    lands in per-binding partial (staging failure leaves prod untouched). GitHub and Vercel are
    inherently per-binding. (Amends ADR-0039.)
  - **Per-binding status** `pending` → `written` | `failed{code, retryable}` on the operation
    record. **Operation states:** `running`, `succeeded` (exit 0), `blocked` (pre-write gate
    tripped, 0 writes, exit 7/2), `incomplete` (writes started, exit 9, `cause` ∈
    {`retryable`, `action_required`}, surfaces "N of M written, retry <op-id>"), `canceled`.
    `incomplete` does not age out.
  - **Sync Target Serialization via a lease row, NOT a Postgres advisory lock** (Hyperdrive
    transaction-mode pooling makes session locks unreliable and forbids holding a txn across
    provider I/O). Keyed by (org, provider, target), `held_by_operation_id` + `expires_at`,
    claimed in a short txn, renewed between writes, reclaimable when expired; fencing token
    checked before each provider write. Contention fails fast as retryable `sync.target_busy`
    (exit 8).
  - **Resume reuses the same operation** (`operations retry <op-id>`): re-claim lease, re-run
    Sync Execution Revalidation, write only `pending`/`failed` bindings. A fresh `syncs run`
    against a sync with an open `incomplete` op is rejected as conflict (exit 6) pointing at it.

  Remaining: CONTEXT.md glossary terms added (Inline Sync Execution, Incomplete Sync Run, Sync
  Run Resume, Sync Target Serialization). Still owed — an ADR superseding ADR-0012 + ADR-0013 and
  amending ADR-0039; rewrite the queue-backed Sync Execution Runtime in `docs/cli-and-sync.md`
  (~969-994, 922-944) to the inline model. _Effort: M (design done; reconciliation S/M). Depends
  on: #1. Sources: Finding 4, Outside Voice._

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

- [ ] **#5 Atomic single-consumption on the Bootstrap Operator Claim** (CONTEXT.md:97-99).
  Resolved 2026-05-25 grill: two mechanisms, different jobs. **CAS** consumes the single pending
  claim in one statement — `UPDATE bootstrap_operator_claim SET status='consumed',
  consumed_by=$user, consumed_at=now() WHERE status='pending'`; rowcount 1 wins, rowcount 0 means
  already claimed (pool/isolation-safe behind Hyperdrive, no advisory lock). The loser gets
  `bootstrap.already_claimed` (exit 6), no operator granted, fail-closed. **Partial unique index**
  is the caller-agnostic backstop making more than one bootstrap-origin Instance Operator
  structurally impossible regardless of code path. On win, invalidate the one-time Bootstrap
  Secret. _Effort: S._

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
