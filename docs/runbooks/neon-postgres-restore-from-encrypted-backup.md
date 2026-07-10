# Runbook: Neon Postgres Restore From Encrypted Backup

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Implements the tested restore gate in
[ADR-0058](../adr/0058-minimal-backup-and-tested-restore.md) and the export envelope in
[ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md).

This runbook handles real custody material and tenant metadata. Output and evidence
must stay metadata-only: no Sensitive Values, decrypted canary plaintext, backup
payload bytes, or key material in logs, tickets, or evidence JSON.

## purpose

Recover tenant metadata and encrypted ciphertext from the latest scheduled R2 export
when the Neon account or project is lost, then prove end-to-end decrypt integrity by
verifying the recovery canary sentinel secret in a fresh environment.

## when_to_use

- **Triggers:** Neon account or project loss; rehearsed pre-production restore drill;
  migration-profile requirement for a fresh recoverability path when a Neon snapshot is
  not used.
- **Non-triggers:** corruption with the Neon account intact (use Neon point-in-time
  restore instead); root-key-only loss without data loss (escrow recovery runbook);
  routine deploys (use `production_deploy` gate, not this drill).

## scope

One Instance, one latest scheduled export artifact, one fresh Neon target, one recovery
canary organization/project/secret scope. Tenant-owned rows restore per organization
snapshot timestamp recorded in the export header.

Consistency limitation (accepted for V1, revisit if it bites): the export is not a single
transactional snapshot of the whole instance. Each organization section is read in its own
`app.current_org` transaction and the instance-scope section in a separate `app.service`
transaction ([ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md)), so instance-scope
rows and per-organization rows can reflect slightly different instants within one run (a torn
read bounded by the run's wall clock). Against a 24-hour RPO this skew is noise and no tenant row
references another organization's rows, so no cross-organization invariant can break; a restore
states each tenant's instant via the per-organization snapshot timestamp. If a future change adds
an instance-scope↔tenant invariant that the skew could violate, wrap the export in one snapshot
(for example a single repeatable-read transaction or an exported snapshot id) at that time.
Tracked as a follow-up, not a V1 blocker.

## required_authority

- Operator with Cloudflare Super Administrator or Secrets Store Deployer/Admin for the
  target Instance binding.
- Escrow access to load the correct `INSTANCE_ROOT_KEY_V{n}` version named in the export
  header.
- Neon project creation rights for the restore target.

## preconditions

- The recovery canary sentinel organization exists in production and is included in
  scheduled exports ([ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md)).
- The latest successful export artifact is present in R2 and passes encryption header
  checks (`backup_restore.export_fresh` not blocked).
- A fresh Neon project and Worker runtime binding are available for the drill target.

## safe_inputs

Root key material enters only through the approved escrow/load ceremony
([instance-root-key-bootstrap.md](instance-root-key-bootstrap.md)). The restore importer
reads encrypted bytes only; it must not log JSONL rows, ciphertext, or decrypted canary
plaintext.

## dry_run

Metadata-only preview:

```sh
pnpm backup-restore:verify-evidence -- --evidence-dir evidence
```

Confirm `backup/export-success.json` and `backup/restore-drill.json` exist, list
`artifact_ref`, `instance_id`, organization snapshot counts, and `expires_at` without
opening the sealed artifact in a transcript.

For a local/CI backup-envelope fixture self-test without Neon:

```sh
pnpm backup-restore:fixture-self-test -- --evidence-dir evidence
```

This tests seal → open → canary verification with an ephemeral fixture key and writes only
`backup/fixture-self-test.json`. It never writes `backup/export-success.json` or
`backup/restore-drill.json`, is not launch-grade evidence, and cannot satisfy the release gate.

## execute

Production-equivalent drill (summary — operator executes manually):

1. Identify the latest successful `backup.export` Operation and its R2 `artifact_ref`.
2. Provision a fresh Neon project and apply schema migrations with the migration role.
3. Load the escrowed root key version from the export header into the fresh Runtime
   Worker Secrets Store binding.
4. Download the sealed artifact and import its JSONL rows using an operator-controlled importer
   (per-organization transactions, no decrypt of Sensitive Values during import). No importer is
   implemented in this repository yet, so the gate remains blocked until this step is performed
   and evidenced outside the fixture self-test.
5. Decrypt only the recovery canary secret through the normal runtime decrypt path.
6. Record wall-clock RTO from download start through successful canary verification.

## verify

Metadata-only verification after execute:

```sh
pnpm backup-restore:verify-evidence -- --evidence-dir evidence
pnpm release-gate:bundle -- --profile small_group_production --evidence-dir evidence
```

Pass requires:

- `backup_restore.drill` control `passed`
- `canary_verification.status` is `passed` in `backup/restore-drill.json`
- `encryption_verified` is `true`
- measured `rto.duration_seconds` is within `rto.target_seconds`
- evidence output contains no forbidden reveal keys (enforced by package tests)
- `artifact_ref`, `source_export_operation_id`, and `source_export_timestamp` match the scheduled
  R2 export evidence
- `restore_target_ref` identifies a fresh Neon project, and import completion precedes runtime
  canary verification

## expected_audit

Under the recovery canary organization scope:

- `backup.restore_drill_succeeded` or `backup.restore_drill_failed`
- Operation intent `backup.export` rows for scheduled exports
- `backup.export_succeeded` / `backup.export_failed` on export runs

Audit and evidence records include scope IDs, operation IDs, timestamps, and status only.

## recovery

- Failed canary verification: do not mark the drill passed; keep production gate blocked.
- Importer failure: discard the fresh Neon target and retry from step 2 with a new project.
- Wrong root key version: select the header `root_key_version` and reload escrowed material.

## customer_communication

Not required for the internal pre-production drill. Follow incident runbooks if this
procedure is executed for a real Neon-account loss affecting tenants.

## evidence

Attach to the Security Evidence Bundle (`backup_restore.*` controls):

| Artifact                  | Path (relative to evidence dir) |
| ------------------------- | ------------------------------- |
| Latest export success     | `backup/export-success.json`    |
| Restore drill report      | `backup/restore-drill.json`     |
| Sealed artifact reference | `artifact_ref` field only       |

Evidence fields include `actor`, `scope` (instance/org/project/secret IDs), `rto`
timestamps and duration, `canary_verification.status`, `encryption_verified`, scheduled-export
linkage, the fresh Neon target reference, import completion, and runtime-canary verification time.
Never attach artifact bytes, JSONL payload, or canary plaintext.
