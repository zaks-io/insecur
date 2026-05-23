# ADR-0007: Developer-First CLI Contract

Date: 2026-05-23

Status: Accepted

The CLI is the primary interface for developers, agents, and CI. It will use a committed non-secret `.insecur.json` for host, organization, project, environment, profile, and branch-to-environment defaults, while credentials remain in user config, environment variables, or OIDC exchanges.

## Consequences

Commands must be safe and scriptable: stable `--json` output, stable error codes, predictable exit codes, `--dry-run` for mutations, idempotency keys for high-risk writes, operation IDs for long-running work, and clear separation of secret values on stdout from status messages on stderr. This makes the CLI easier for humans without making agents parse prose.
