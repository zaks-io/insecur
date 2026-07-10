# @insecur/backup-restore Context

Scoped context for agents working in `packages/backup-restore`.

## Role

Owns encrypted backup metadata, restore drill evidence evaluation, and the recovery
canary verification path for production readiness gates.

## Read First

- `../../docs/adr/0058-minimal-backup-and-tested-restore.md`
- `../../docs/adr/0072-backup-export-pipeline-and-freshness.md`
- `../../docs/adr/0084-runtime-only-restore-import-boundary.md`
- `../../docs/security-runbooks-and-release-gates.md`
- `../../docs/runbooks/neon-postgres-restore-from-encrypted-backup.md`

## Owns

- Backup export envelope validation (instance-scoped, root-key wrapped DEK).
- Recovery canary scope constants and metadata-only verification.
- Restore drill and export freshness evidence shapes.
- Local/CI backup-envelope fixture self-test (`pnpm backup-restore:fixture-self-test`), which does
  not produce release-gate evidence.

## Does Not Own

- Neon provisioning or production operator ceremonies.
- Release gate bundle assembly (`@insecur/release-gate` consumes this package).
- Restore import execution: it runs inside `apps/runtime` behind the restore-only
  `RuntimeRestoreService` entrypoint (ADR-0084). There is no second key-bearing backup or restore
  Worker; the Runtime deploy is the only root-key holder for backup and restore.

Scheduled Worker export execution and R2 landing live in `apps/runtime` (ADR-0072).
