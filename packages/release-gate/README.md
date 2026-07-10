# @insecur/release-gate

Metadata-only Security Evidence Bundle assembly and the initial security check
skeleton for release gating.

## Owns

- Security Evidence Bundle shape and assembly.
- Security check skeleton control IDs for verify, dependency scan, secret scan,
  syft and grype vulnerability scan, and ASVS/API Top 10 checklist status.
- Metadata-only secret-scan summarization without Sensitive Values.
- Fail-closed bundle verdict derivation.
- Backup/restore evidence evaluation and external no-plaintext evidence requirements.

## Consumes

- Metadata-only evidence artifacts under a caller-provided evidence directory.
- `docs/security-runbooks-and-release-gates.md` for control vocabulary.

## Does Not Own

- Scanner execution (gitleaks, grype, semgrep, dependency scanners).
- Human production readiness signoff.
- Hosted evidence portals or external compliance attestation.

## Interface Tests

Tests prove bundle shape, missing evidence handling, failed checks, successful
bundles, and no-reveal output constraints.

## Dependency Rule

This package may depend on domain packages that own evidence parsing or metadata-safety policy. It
must not execute scanners, deploy infrastructure, query provider sinks, or own product workflows.
