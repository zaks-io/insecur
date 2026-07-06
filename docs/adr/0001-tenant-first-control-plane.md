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
- Authorization is scope-first: Effective Access authorization scopes are evaluated for decisions, and Roles are assignment bundles that contribute scopes.
- V1 exposes built-in `Role` presets only for User and Team assignment: owner, admin, developer, metadata viewer, approval, and read-only. Arbitrary human/team scope editing is deferred.
- Built-in Role presets are backed by granular authorization scopes so custom role management or explicit human/team scope assignment can be added later without changing authorization checks.
- The owner preset includes approval scopes for solo-owner operation. Admin and developer presets do not include approval scopes.
- The Approval Role is the additive preset for granting approval scopes to non-owners without granting project configuration, App Connection, Secret Sync configuration, Runtime Injection Policy, or membership management scopes.
- Approval scopes may be organization-scoped or project-scoped. Organization-scoped approval applies across projects in the organization; project-scoped approval applies only to Approval Requests for Protected Environments in that project.
- Membership is the normalized grant concept for Users, Teams, and Machine Identities, with subject-type constraints.
- V1 creates one non-authorizing default Team per Organization and defers rich team management, nested teams, directory sync, and SCIM workflows.
- V1 Invitation acceptance adds the User to the default Team unless a future Invitation workflow explicitly targets another Team.
- Default Team association does not grant access by itself; an explicit Membership is still required.
- A V1 Invitation targets exactly one Membership grant: either one organization-scoped role or one project-scoped role.
- Organization-scope User and Team memberships contribute authorization scopes that apply across projects in the organization; project-scope memberships are used for narrower collaborator access.
- User and Team memberships use built-in Role presets in V1 and remain compatible with future explicit human/team authorization scope grants; Machine Identity memberships carry explicit authorization scopes now.
- `Machine Identity` is owned by an organization and receives short-lived access tokens through an auth method.
- V1 Machine Identity memberships are project-scoped only; organization-scoped machine memberships are deferred until organization-wide automation is needed.
- Deploy automation should use project/environment-bounded credential scopes issued through auth methods such as Environment Deploy Keys; the deploy key is not itself the membership actor.
- GitHub Actions OIDC is the preferred CI auth method because it avoids long-lived tokens in GitHub.
- `App Connection` is organization-owned and stores encrypted provider credentials for Vercel, GitHub, and Cloudflare.
- Each app connection records a provider-specific connection method. OAuth app, provider app installation, and integration OAuth are preferred; scoped provider tokens are allowed only where the provider API lacks a suitable OAuth/app flow.
- `Secret Sync` is project-owned and uses an app connection to push secrets to an external sync target.
- Provider integrations should use OAuth app or provider app installation flows where available instead of asking users to copy and paste scoped provider tokens.
- Audit log entries include organization context and project context when applicable.
- Organization-level sensitive data is protected by organization data keys; project secrets are protected by project data keys.
- Encrypted records store the key version needed to decrypt or rewrap them.
- The Secret ciphertext layer is bound to organization, project, environment, and secret identity with authenticated data; the DEK-wrap layer binds the data-key version.
- Secret version creation, current-version updates, and rollback must be serialized or transactional enough for multi-user writes.
- Key rotation and credential rotation are first-class workflows with dry-run/plan output, resumable execution, verification, and audit events.
- Routes and CLI commands must make the organization context explicit or derive it from a checked local project config.

## Consequences

The current pre-v1 schema should be treated as disposable learning code, not a production migration target or supported compatibility surface. The next implementation slice should introduce the tenant model before adding sync engines or a UI.

Every data access path needs an object-level authorization check that starts from the authenticated actor and resolves through organization/project membership. A route that can load a row by ID without organization context is a bug.

The CLI needs a committed, non-secret project config so agents can run commands without repeating host, organization, project, and environment flags. Secret-bearing credentials are memory/session-only and must not be persisted by the CLI; use provider/OIDC exchanges, safe stdin flows, or session-only child environments instead of project config or user config.

Provider app connections add setup work per provider, but they improve user control: users can revoke Vercel and GitHub through their app installation flows, and revoke Cloudflare by deleting the scoped Cloudflare API token at the provider.

Some provider APIs may not expose a suitable OAuth/app installation path for the exact resource operation insecur needs. In those cases, the app connection still owns and encrypts the credential, the method is visible, the credential must be least-privileged and provider-revocable, and global API keys are not accepted.

Key rotation adds schema and job complexity, but it is necessary operational hygiene for a secrets manager. The implementation should prefer rewrapping key material over decrypting Sensitive Values, and every rotation path must be scriptable by the CLI.

## Amendment (2026-06-11): Built-In Role presets are six, including the Metadata Viewer Role

The Decision bullet above originally listed five Built-In Role presets: owner, admin, developer, approval, and read-only. CONTEXT.md's Built-In Roles list is canonical and includes a sixth preset, the Metadata Viewer Role, so the bullet has been edited in place to the six-role list. ADR-0003's matching amendment defines what the Metadata Viewer Role grants and withholds and records the current five-preset code divergence in `packages/access/src/built-in-role-scopes.ts`.

## References

- Infisical (reference implementation): https://github.com/Infisical/infisical
- OAuth 2.0 Security Best Current Practice: RFC 9700
- OWASP Authentication Cheat Sheet
- OWASP Session Management Cheat Sheet
- OWASP Multi-Tenant Application Security Cheat Sheet
- OWASP Secrets Management Cheat Sheet
- NIST SP 800-57 Part 1
