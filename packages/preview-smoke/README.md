# @insecur/preview-smoke

The preview smoke harness: assertions, probes, and evidence artifacts run against a deployed
preview fleet.

This package is test infrastructure, not product code. It drives the real CLI and the real
public routes against a deployed environment and writes the evidence the release gate reads.

## Owns

- CLI smoke command execution and the metadata-only output assertions for each command surface
  (auth, audit, config, connections, operations, run policies, agent attribution).
- Metadata-read probes and denied-response assertions for unauthorized actors.
- Plaintext sweeps: the CLI output scan and the R2 backup no-plaintext sweep.
- Audit export artifacts and audit verification against the preview database.
- Deploy identity proof: global setup, teardown, and the evidence file the production gate
  verifies before deploying the same SHA.
- Smoke artifact roots, artifact credential registration, revocation, and sweep.

## Consumes

- `@insecur/domain`, `@insecur/auth`, `@insecur/audit`, `@insecur/backup-restore`.
- `postgres` for direct verification queries against the preview database.

## Does Not Own

- Product behavior. A failure here is evidence about a deploy, not a unit under test.
- The unit and integration layers (`docs/agents/testing.md`).
- Release gate policy (`@insecur/release-gate`), which consumes this package's evidence.

## Interface Tests

The assertion helpers are themselves unit-tested so a smoke failure means the deploy is wrong,
not the harness. Those tests run in the DB-less layer.

## Dependency Rule

Assertions are metadata-only. Any probe that could observe a Sensitive Value must assert its
absence rather than its content.
