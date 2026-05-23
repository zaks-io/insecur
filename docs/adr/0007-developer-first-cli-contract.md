# ADR-0007: Developer-First CLI Contract

Date: 2026-05-23

Status: Accepted

The CLI is the primary interface for developers, agents, and CI. It will use a committed non-secret `.insecur.json` for host, organization slug, project slug, environment slug, profile, and branch-to-environment defaults, while credentials and resolved stable IDs remain in user config, environment variables, OIDC exchanges, or local cache outside the repository.

## Consequences

Commands must be safe and scriptable: stable `--json` output, stable error codes, predictable exit codes, `--dry-run` for mutations, idempotency keys for high-risk writes, operation IDs for long-running work, and clear separation of secret values on stdout from status messages on stderr. This makes the CLI easier for humans without making agents parse prose.

Committed project config stores slugs only because that keeps the file readable, reviewable, and easy for agents to edit. The CLI may cache resolved organization/project/environment IDs outside the repository and should invalidate that cache when slugs resolve to different IDs.
