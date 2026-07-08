# @insecur/backup-restore

Encrypted backup metadata, restore drill evidence, and recovery canary verification
for production readiness gates (INS-91, ADR-0058, ADR-0072).

## Owns

- Instance-scoped backup export envelope seal/open helpers.
- Recovery canary sentinel scope and metadata-only verification.
- `backup_restore.export_fresh` and `backup_restore.drill` evidence evaluation.
- Local restore drill command for CI and developer verification.

## Consumes

- `@insecur/audit` for export success/failure audit events.
- `@insecur/crypto` for tenant-bound secret encryption in canary fixtures.
- `@insecur/domain` for opaque resource IDs and base64url helpers.
- `@insecur/operations` for scheduled `backup.export` Operations.
- `@insecur/tenant-store` for per-org scoped reads under forced RLS.

## Does Not Own

- Security Evidence Bundle assembly (`@insecur/release-gate`).

Scheduled Worker export execution and R2 landing live in `apps/runtime` (ADR-0072).

## Interface Tests

- `test/backup-restore.test.ts` — envelope round-trip and local drill evidence.
- `test/evaluate-readiness.test.ts` — fail-closed readiness evaluation.
- `test/backup-export.integration.test.ts` — real Postgres export, decrypt, freshness, and operation semantics.

## Commands

```sh
pnpm --filter @insecur/backup-restore drill -- --evidence-dir evidence
pnpm --filter @insecur/backup-restore verify-evidence -- --evidence-dir evidence
```
