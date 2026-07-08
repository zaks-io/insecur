# @insecur/backup-restore Context

Scoped context for agents working in `packages/backup-restore`.

## Role

Owns encrypted backup metadata, restore drill evidence evaluation, and the recovery
canary verification path for production readiness gates.

## Read First

- `../../docs/adr/0058-minimal-backup-and-tested-restore.md`
- `../../docs/adr/0072-backup-export-pipeline-and-freshness.md`
- `../../docs/security-runbooks-and-release-gates.md`
- `../../docs/runbooks/neon-postgres-restore-from-encrypted-backup.md`

## Owns

- Backup export envelope validation (instance-scoped, root-key wrapped DEK).
- Recovery canary scope constants and metadata-only verification.
- Restore drill and export freshness evidence shapes.
- Local/CI restore drill command (`pnpm backup-restore:drill`).

## Does Not Own

- Neon provisioning or production operator ceremonies.
- Release gate bundle assembly (`@insecur/release-gate` consumes this package).

Scheduled Worker export execution and R2 landing live in `apps/runtime` (ADR-0072).
