# @insecur/preview-smoke Context

Scoped context for agents working in `packages/preview-smoke`. This file is a
reading map, not an independent glossary.

## Role

This package owns the deployed-preview smoke layer: it drives the real CLI and the real public
routes against a deployed fleet and writes the evidence artifacts the release gate reads. It is
test infrastructure, not product code.

## Read First

- `../../docs/adr/0065-test-layers-and-preview-smoke.md`
- `../../docs/agents/testing.md`
- `../../docs/adr/0058-minimal-backup-and-tested-restore.md`
- `../../docs/security-runbooks-and-release-gates.md`
- `packages/release-gate/CONTEXT.md`

## Terms To Load

- `../../docs/context/glossary/sensitive-data-safety.md`
- `../../docs/context/glossary/operations-deploy-release.md`

## Adjacent Terms

- Release gate policy lives in `packages/release-gate/CONTEXT.md`; this package produces the
  evidence that gate consumes.

## Owns

- CLI smoke execution and metadata-only output assertions per command surface.
- Metadata-read probes and denied-response assertions for unauthorized actors.
- Plaintext sweeps, including the R2 backup no-plaintext sweep.
- Audit export artifacts and audit verification against the preview database.
- Deploy identity proof setup, teardown, and evidence.
- Smoke artifact roots, credential registration, revocation, and sweep.

## Does Not Own

- Product behavior. A failure here is evidence about a deploy.
- The unit and integration test layers.
- Release gate policy (`@insecur/release-gate`).

## Plaintext Rule

Every assertion is metadata-only. A probe that could observe a Sensitive Value asserts its
absence, never its content.
