# Runbook: Neon Postgres Restore From Encrypted Backup

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Implements the tested-restore gate in [ADR-0058](../adr/0058-minimal-backup-and-tested-restore.md)
and the export freshness contract in
[ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md). Satisfies control
`backup_restore.drill` and `backup_restore.export_fresh`.

This runbook is **HITL, human-only** for production drills. The recovery canary
plaintext exists only inside the approved restore verification step and must not
appear in audit exports, tickets, or evidence bundles.

## purpose

Prove that the latest encrypted R2 logical export decrypts end-to-end in a fresh
Neon project with the escrowed root key, establishing real RTO before valuable
production secrets are stored.

## when_to_use

- **Triggers:**
  - Pre-production gate: first `small_group_production` sign-off requires a passed
    restore drill ([ADR-0058](../adr/0058-minimal-backup-and-tested-restore.md)).
  - `backup_restore.export_fresh` blocks because the latest successful export is
    older than 48h ([ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md)).
  - Disaster: loss of Neon account/project while R2 export and escrow remain.
  - Annual or post-incident re-drill per security review.
- **Non-triggers:**
  - Point-in-time restore with the Neon account intact (use Neon branch restore;
    RPO minutes, no R2 import).
  - Root-key-only loss with intact Neon (escrow load per bootstrap runbook).
  - Tenant export/deletion workflows (data-subject concern, not DR).

## scope

Whole Instance metadata in the chosen R2 export artifact. The recovery canary
sentinel Organization (`org_*` placeholder) proves decrypt without touching
customer Organizations.

## required_authority

- **Neon:** account role able to create a fresh project and import logical data.
- **R2:** read access to the latest `backup.export` artifact for the Instance.
- **Cloudflare Secrets Store:** Super Administrator or Secrets Store Deployer/Admin
  to load the escrowed root key into the drill environment binding.
- **Escrow:** read access to the 1Password instance-custody vault item.

## preconditions

- At least one successful scheduled export exists in R2 (operation intent
  `backup.export` per [ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md)).
- Recovery canary sentinel org/project/secret was written through the normal product
  path before the export.
- Escrow item matches the active `root_key_version` bound in
  `apps/runtime/wrangler.jsonc`.
- Drill uses the **latest real scheduled export**, never a hand-made artifact
  ([ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md)).

## safe_inputs

The recovery canary expected plaintext is a known sentinel value used only during
`restore verify`. It enters only in the verification command's approved check and
must not be logged, exported, or stored in evidence. Root-key material follows
[instance-root-key-bootstrap.md](instance-root-key-bootstrap.md) safe-input rules.

## dry_run

Metadata-only planning without mutating production:

```bash
insecur restore plan --json --export-ref <r2-export-id-placeholder>
insecur operations get <op_backup_export_id> --json
```

Confirm:

- Export artifact ID, `created_at`, and encryption envelope metadata.
- Sentinel org/project/secret IDs in the plan output (IDs only).
- Freshness: latest `backup.export_succeeded` audit event within 48h for ongoing
  production posture.

## execute

Order is load-bearing: **provision → import → bind root key → verify canary**.

1. **Record start time** for RTO measurement.
2. **Provision** a fresh Neon project (drill environment, not production).
3. **Import** the latest R2 encrypted logical export using the instance JSONL
   importer rehearsed in ADR-0072 (same path the scheduled `backup.export`
   operation produces).
4. **Load root key** from escrow into a fresh Secrets Store secret and bind it on
   the drill Runtime Worker per [instance-root-key-bootstrap.md](instance-root-key-bootstrap.md).
5. **Point** the drill Runtime Worker Hyperdrive binding at the fresh Neon project.
6. **Verify** the recovery canary (see `verify`).
7. **Record wall-clock RTO** and attach to evidence. Tear down or isolate the drill
   project when complete.

For Neon-account-intact corruption, skip R2 import and use Neon PITR branch
restore instead; record that path separately in evidence.

## verify

```bash
insecur restore verify --json --export-ref <r2-export-id-placeholder>
pnpm test:canary
```

- Recovery canary decrypt matches expected sentinel value through the normal
  Runtime decrypt path (metadata-only success output; no plaintext in logs).
- `backup_restore.drill` evidence records measured RTO and export ID.
- `backup_restore.export_fresh` evidence shows `expires_at` within 48h of latest
  `backup.export_succeeded` when checking ongoing production readiness.
- `pnpm security:check` (alias `pnpm release-gate:bundle`) includes passing or
  honestly blocked backup controls with artifact refs.

## expected_audit

- Export pipeline: `backup.export_succeeded` or `backup.export_failed` on the
  recovery-canary sentinel Organization (ADR-0072).
- Drill operations recorded under `backup.export` intent with metadata-only
  progress in the Operation Store.
- Restore verification audit entries reference export ID, canary resource IDs, and
  pass/fail without Sensitive Values.

## recovery

- **Import fails mid-stream:** discard the fresh Neon project and restart from the
  same export artifact; do not partially attach production Workers.
- **Canary verify fails:** treat as drill failure; block `small_group_production`
  until root cause is fixed (wrong export, wrong key version, incomplete import).
- **Export stale (>48h):** trigger or wait for a fresh `backup.export` run before
  claiming `backup_restore.export_fresh` passed.
- **Stop:** do not store valuable production secrets until drill evidence is
  attached and `backup_restore.drill` is `passed`.

## no_reveal_handling

- Plans and status output show export IDs, org/project/secret IDs, hashes, and
  operation state only.
- Never attach export file contents, DEKs, root-key hex, or canary plaintext to
  Linear, PRs, or the Security Evidence Bundle.
- `insecur audit export` / `insecur audit verify` for the drill window may use
  low-privilege export mode unless Sensitive Detail Gate authorizes more.

## customer_communication

None for pre-production drills. For actual Neon-account-loss recovery affecting
tenants, follow counsel-approved incident communication after scope is known from
metadata-only audit export.

## evidence

Attach to the Security Evidence Bundle (`backup_restore.*`), all metadata-only:

- R2 export artifact ID and `backup.export_succeeded` audit event ID.
- Fresh Neon project ID (drill) and import completion timestamp.
- Measured RTO (wall clock) vs internal targets in [security-plan.md](../security-plan.md).
- Recovery canary verification result (`passed`/`failed`, no plaintext).
- `backup_restore.export_fresh` `expires_at` when applicable.
- Runbook drill ID for `runbook.*` control.
