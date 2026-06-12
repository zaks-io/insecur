# ADR-0058: Minimal Backup And Tested Restore For V1

Date: 2026-05-25

Status: Accepted

V1 ships a minimal backup and tested-restore model covering three loss scenarios with three mechanisms. A custodian that cannot recover the root-key custody material or the Neon metadata store is unrecoverable for its tenants, so `docs/open-questions.md` forbade leaving this to a post-v1 hardening bucket; this ADR is the decision that closes it.

The three scenarios and their recoveries:

- **Corruption, bad migration, or accidental delete with the Neon account intact.** Recover with Neon native point-in-time restore (branch to a timestamp). History retention is set to 7 days. RPO near-zero, RTO minutes. Nothing bespoke to build beyond confirming the retention window.
- **Loss of the Neon account or project** (billing lapse, account compromise, vendor or region loss), where point-in-time restore is gone with it. Recover from one scheduled daily independent encrypted logical export landed in R2. RPO 24 hours, RTO same business day, manual.
- **Root-key custody loss.** Recover the key from the ADR-0028 offline sealed escrow. RPO zero by the escrow-before-load invariant, RTO a few hours, manual.

Recovery targets are internal best-effort goals, not customer-facing SLAs; committing to a contractual recovery time at V1 would manufacture liability the legal posture (ADR-0046, ADR-0047) deliberately avoids.

The R2 export is encrypted under the existing instance custody chain (the root key, already escrowed under ADR-0028), not a separate backup key. One custody chain is protected and escrowed, the escrow already covers the export, and restoring the export therefore requires the escrowed key. As a result the Neon-account-loss drill and the root-key-loss drill collapse into one end-to-end rehearsal.

Tested restore is a hard pre-production gate, not post-v1 hardening. Before any valuable production secret is stored, alongside Storage Security Gate sign-off, one end-to-end restore drill must pass: provision a fresh Neon project, import the latest R2 export, load the escrowed root key into a fresh Cloudflare Secrets Store binding, and decrypt a recovery canary to its expected value. The recovery canary is a sentinel organization, project, and secret with a known plaintext, written through the normal path and existing only to prove a restore decrypts end-to-end. The measured wall-clock restore time is recorded against the targets, which establishes the real RTO rather than asserting one, and the "Neon Postgres restore from encrypted backup" runbook carries the rehearsed steps.

## Considered Options

- **Defer the whole thing to post-v1 hardening.** Rejected: it leaves the custodian a single Neon-account or root-key loss away from being unrecoverable for tenants, which is the existential failure for a secrets custodian. `docs/open-questions.md` explicitly excluded this from the hardening bucket.
- **Drop the independent R2 export; rely only on Neon point-in-time restore plus escrow.** Rejected: escrow saves the key, not the data. A Neon-account-level loss with no independent export leaves the operator holding the root key with nothing to decrypt, so escrow "working" would not recover any tenant. The daily R2 dump is the cheap floor against that case.
- **Mint a separate backup key for the R2 export** (the security-plan's "separate backup key where practical"). Rejected for V1: a second custody chain to generate, escrow, and physically protect for marginal benefit. Reusing the root key keeps one custody chain and lets the two existential drills combine. Additive later.
- **Tighter RPO or continuous independent replication.** Rejected for V1: at prove-concept volume a daily export is enough, and the deliberate absence of a contractual SLA means there is no target forcing sub-daily independent copies yet.

## Consequences

- `docs/security-plan.md` section 8 is rewritten from its "snapshots or exports" stub to this decided model, and the "Neon Postgres restore from encrypted backup" runbook (already in the V1 runbook inventory) becomes required and carries the rehearsed steps plus the measured RTO.
- A recovery canary must exist for the drill to be verifiable; it is part of the pre-production gate, not optional tooling.
- The restore drill is a release gate. Storing valuable production secrets is blocked until the drill passes once and the RTO is recorded. The model is decided now; the drill executes once the storage baseline exists, since there is no product code yet.
- Re-adding a separate backup key, tighter RPO, cross-region copies, or the broader recovery-drill set (data key corruption, accidental secret deletion beyond the point-in-time window) later is additive and high-reversibility, consistent with the 2026-05-25 scope-reduction posture.
- The loss limit stays documented: if both the escrow and the live root key are lost, encrypted data is unrecoverable by design (ADR-0044, ADR-0028).

## Amendment (2026-06-12): Export pipeline and freshness are decided in ADR-0072

This record decides the recovery model and the one-time restore-drill gate. The export pipeline's execution venue, its encryption envelope, and the continuous `backup_restore.export_fresh` freshness control that keeps the latest export trustworthy after the drill passes are decided in [ADR-0072](0072-backup-export-pipeline-and-freshness.md). The envelope decided there stays inside this record's single-custody-chain decision: restoring the export still requires the escrowed root key, and no separate backup key is introduced.
