# ADR-0007: Developer-First CLI Contract

Date: 2026-05-23

Status: Accepted

The CLI is the primary interface for developers, agents, and CI. It will use a committed non-secret `.insecur.json` for host, organization ID, project ID, environment ID, profile ID, and branch-to-environment ID defaults. Credential values are memory/session-only and are not persisted by the CLI.

CLI Profiles are non-secret selectors for host, organization, project, environment, and default runtime policy by opaque ID. `insecur run <profile-id> -- <command>` is the preferred deploy and local command path because it injects approved secrets into the child process without creating local secret files or returning plaintext to the caller.

The CLI does not persist credentials by default. Human login is memory/session-only: use an authenticated subshell or a one-shot command, with short-lived tokens stored only in process memory or a child process environment for that shell session.

Production Runtime Injection depends on the Storage Security Gate. The CLI flow may be implemented for scaffold validation, but production runtime injection must fail closed until tenant-bound encryption for Secrets, Provider Credentials, and Sensitive Metadata is implemented and verified.

## Consequences

Commands must be safe and scriptable: stable `--json` output, stable error codes, predictable exit codes, `--dry-run` for mutations, idempotency keys for high-risk writes, operation IDs for long-running work, and delivery-first secret handling that avoids returning plaintext values to the caller by default. This makes the CLI easier for humans without making agents parse prose or exposing secrets to agent context.

Committed project config stores opaque IDs only. Human-friendly names are Sensitive Display Names decrypted after authorization, not durable plaintext selectors. The CLI should refresh scoped lists and report a stable warning or error code when an ID no longer resolves inside the authorized tenant boundary.

V1 is configuration-driven and does not require general search over Sensitive Metadata. The CLI should use Scoped Lists for discovery and Configured Selectors for repeated commands. Configured Selectors are opaque IDs, not plaintext names or slugs. Sensitive Display Names may be decrypted for authorized list/detail output, but secret names, provider target names, policy binding names, and security-relevant relationships must not be copied into plaintext search indexes.

Provider sync remains the native-platform delivery path for Cloudflare, Vercel, and GitHub. Runtime injection remains the just-in-time path for deploys and local commands that can read secrets from environment variables.

Sensitive values are accepted only through safe input paths. The CLI must not support `--value <secret>`, `--token <secret>`, `--client-secret <secret>`, or equivalent argument forms for secret values, provider credentials, deploy keys, bootstrap secrets, or OIDC tokens.
