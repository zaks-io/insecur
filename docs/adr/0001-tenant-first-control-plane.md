# ADR-0001: Tenant-First Control Plane

Date: 2026-05-23

## Status

Accepted

## Context

insecur manages valuable secrets. The product should serve multiple organizations, users, and projects while staying focused on the Cloudflare, Vercel, and GitHub Actions stack.

The initial implementation is project-scoped and suitable for a trusted single-owner deployment. That model is not enough for multi-tenant use because project selectors are not tenant-bound, users are allowlisted globally, app credentials would not have a tenant boundary, and audit logs are not tenant-qualified.

Infisical is the reference system for lessons learned, but not a blueprint to copy feature-for-feature. The useful pattern is tenant-first modeling: organizations own projects, memberships, roles, machine identities, app connections, and tenant-qualified audit logs.

## Decision

insecur will adopt an organization-first control plane before v1 production use.

- `Organization` is the top-level tenant.
- `Project` belongs to exactly one organization, and durable selectors use opaque resource IDs.
- `User` access is granted by organization and project memberships, not by global allowlist.
- `Role` remains deliberately small at first: owner, admin, developer, and read-only.
- `Machine Identity` is owned by an organization and receives short-lived access tokens through an auth method.
- GitHub Actions OIDC is the preferred CI auth method because it avoids long-lived tokens in GitHub.
- `App Connection` is organization-owned and stores encrypted provider credentials for Vercel, GitHub, and Cloudflare.
- Each app connection records a provider-specific connection method. OAuth app, provider app installation, and integration OAuth are preferred; scoped provider tokens are allowed only where the provider API lacks a suitable OAuth/app flow.
- `Secret Sync` is project-owned and uses an app connection to push secrets to an external sync target.
- Provider integrations should use OAuth app or provider app installation flows where available instead of asking users to copy and paste scoped provider tokens.
- Audit log entries include organization context and project context when applicable.
- Organization-level sensitive data is protected by organization data keys; project secrets are protected by project data keys.
- Encrypted records store the key version needed to decrypt or rewrap them.
- Secret ciphertext is bound to organization, project, environment, secret, and version identity with authenticated data.
- Secret version creation, current-version updates, and rollback must be serialized or transactional enough for multi-user writes.
- Key rotation and credential rotation are first-class workflows with dry-run/plan output, resumable execution, verification, and audit events.
- Routes and CLI commands must make the organization context explicit or derive it from a checked local project config.

## Consequences

The current pre-v1 schema should be treated as a scaffold, not a production migration target. The next implementation slice should introduce the tenant model before adding sync engines or a UI.

Every data access path needs an object-level authorization check that starts from the authenticated actor and resolves through organization/project membership. A route that can load a row by ID without organization context is a bug.

The CLI needs a committed, non-secret project config so agents can run commands without repeating host, organization, project, and environment flags. Secret-bearing credentials are memory/session-only and must not be persisted by the CLI; use provider/OIDC exchanges, safe stdin flows, or session-only child environments instead of project config or user config.

Provider app connections add setup work per provider, but they improve user control: users can revoke Vercel and GitHub through their app installation flows, and revoke Cloudflare by deleting the scoped Cloudflare API token at the provider.

Some provider APIs may not expose a suitable OAuth/app installation path for the exact resource operation insecur needs. In those cases, the app connection still owns and encrypts the credential, the method is visible, the credential must be least-privileged and provider-revocable, and global API keys are not accepted.

Key rotation adds schema and job complexity, but it is necessary operational hygiene for a secrets manager. The implementation should prefer rewrapping key material over decrypting plaintext secrets, and every rotation path must be scriptable by the CLI.

## References

- Infisical local reference: `/Users/isaacsuttell/src/infisical`
- OAuth 2.0 Security Best Current Practice: RFC 9700
- OWASP Authentication Cheat Sheet
- OWASP Session Management Cheat Sheet
- OWASP Multi-Tenant Application Security Cheat Sheet
- OWASP Secrets Management Cheat Sheet
- NIST SP 800-57 Part 1
