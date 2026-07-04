# @insecur/backup-restore

Encrypted backup metadata, restore drill evidence, and recovery canary verification
for production readiness gates (INS-91, ADR-0058, ADR-0072).

## Owns

- Instance-scoped backup export envelope seal/open helpers.
- Recovery canary sentinel scope and metadata-only verification.
- `backup_restore.export_fresh` and `backup_restore.drill` evidence evaluation.
- Local restore drill command for CI and developer verification.

## Consumes

- `@insecur/crypto` for tenant-bound secret encryption in canary fixtures.
- `@insecur/domain` for opaque resource IDs and base64url helpers.

## Does Not Own

- Scheduled Worker export jobs, R2 writes, or Neon restore operator steps.
- Security Evidence Bundle assembly (`@insecur/release-gate`).

## Interface Tests

- `test/backup-restore.test.ts` — envelope round-trip and local drill evidence.
- `test/evaluate-readiness.test.ts` — fail-closed readiness evaluation.
- `test/no-reveal.test.ts` — metadata-only evidence constraints.

## Commands

```sh
pnpm --filter @insecur/backup-restore drill -- --evidence-dir evidence
pnpm --filter @insecur/backup-restore verify-evidence -- --evidence-dir evidence
```
