# Architecture

insecur is a Cloudflare-native, multi-tenant secrets control plane for a Cloudflare, Vercel, and GitHub Actions stack. It borrows proven product ideas from larger secrets platforms, but keeps the implementation narrow: organization-scoped tenant isolation, one source of truth, scoped machine access, auditability, immutable versions, OAuth app connections, and platform sync.

## Product Boundary

The goal is not to clone a full enterprise secrets platform. The first-class use case is many projects and multiple users in a focused stack that wants professional controls without long-lived containers or broad enterprise integrations.

In scope:

- Cloudflare Workers API with D1 metadata storage
- Organization-first multi-tenancy with memberships and roles
- WebCrypto envelope encryption for secret versions and sensitive organization data
- GitHub OAuth for humans
- Machine identities, short-lived access tokens, and GitHub Actions OIDC federation
- CLI pull and run flows
- OAuth app connections for Vercel, GitHub, and Cloudflare where providers support them
- Push sync targets for Vercel env vars, GitHub Actions secrets, and Cloudflare Worker secrets
- Audit log, version history, rollback, key rotation, credential rotation, and encrypted backups

Out of scope unless the product direction changes:

- SCIM, LDAP, SAML, PAM, and HSM integrations
- Dynamic database credentials across many database engines
- Long-lived Docker services
- Broad enterprise policy surfaces before the core stack is excellent

## Infisical Lessons To Borrow

`~/src/infisical` is useful as a reference for shape, not scope. The patterns worth borrowing are:

- Organizations are the tenant root.
- Projects belong to organizations.
- Memberships attach users, groups, or machine identities to organization/project scopes.
- Roles are evaluated at organization and project scope.
- Machine identities are organization-owned and receive short-lived access tokens through auth methods.
- App connections are organization-owned encrypted credentials for external providers, with a provider-specific connection method.
- Secret syncs are project-level mappings from source secrets to provider destinations.
- Audit logs carry organization context and project context.
- Organization and project data keys provide cryptographic isolation below the instance root key.

The patterns to avoid for now are broad enterprise surfaces that do not serve the focused Cloudflare/Vercel/GitHub Actions flow: SCIM, LDAP, SAML, PAM, broad dynamic secret engines, certificate management, and heavy custom policy systems.

The accepted architectural decisions are indexed in [adr/README.md](adr/README.md).

## Monorepo Shape

The repository follows Turborepo conventions:

- `apps/worker` is the deployable Cloudflare Worker service.
- `packages/cli` is the distributable Node CLI.
- Root scripts call `turbo run ...` so builds and typechecks use the package graph and cache correctly.
- Package scripts stay local to each workspace. The root only orchestrates.

## Security Model

Secrets are stored as immutable versions. The target encryption model uses project data keys for project secrets and organization data keys for organization-level sensitive data such as app connection credentials and machine identity auth method credentials. Those data keys are wrapped by instance key material stored as Worker secrets.

Secret encryption should use AES-256-GCM authenticated data that binds ciphertext to organization, project, environment, secret, and version identity. This does not hide metadata, but it prevents ciphertext from being replayed or mis-bound across tenants or resources without detection.

Human users authenticate through GitHub OAuth. In the current scaffold, humans are allowlisted by login. In the multi-tenant target, login establishes user identity only; authorization comes from organization and project memberships.

Machine access should move from long-lived bearer tokens to machine identities that exchange an auth method credential for a short-lived access token. GitHub Actions OIDC should be the preferred CI path so GitHub stores no insecur token.

## Auth Requirements

Authentication and authorization should follow boring, current best practice:

- Authentication establishes the actor; authorization always checks membership, role, tenant, resource, and action.
- Human sessions use secure, HttpOnly, SameSite cookies, short idle/absolute lifetimes, CSRF protection for browser mutations, and session rotation after login or privilege changes.
- OAuth flows use authorization code flow, exact redirect URI matching, state, PKCE where supported, and mix-up defenses when more than one provider/issuer is involved.
- Access tokens are short-lived and scoped. Bearer tokens are accepted only in the `Authorization` header, never query strings.
- Refresh credentials are rotated or sender-constrained where practical. Reuse of an invalidated refresh credential should revoke the credential family and create an audit event.
- MFA should be supported for human users before public multi-tenant use, either through a trusted identity provider or an explicit WebAuthn/TOTP feature.
- Break-glass access must be explicit, audited, and limited to organization owners.
- Denied authorization should not reveal whether a cross-tenant resource exists.

Authorization checks are object-level and tenant-qualified:

- The authenticated actor must resolve to an organization or project membership.
- Project slugs are resolved within an organization, not globally.
- Every secret read/write checks organization, project, environment, optional path, and action.
- Every app connection read/use checks organization membership and, for secret syncs, project permission.
- Audit log writes include organization context, project context when applicable, typed actor/resource fields, request IDs, denied authorization events, and enough source metadata to support incident review.
- Secret-bearing responses use `Cache-Control: no-store`.

For OAuth integrations, use authorization-code based provider flows with exact redirect URIs, state, PKCE where supported, least-privilege scopes, encrypted refresh credentials, and provider-side disconnect/revoke behavior. The product should not ask users to paste raw API keys when a provider supports an OAuth app or provider app installation model.

## Provider Connection Methods

App connections should have an explicit `method` field so provider differences are isolated behind a narrow interface.

- GitHub: prefer GitHub App installation over a broad OAuth app because installations have finer repository permissions and short-lived installation tokens.
- Vercel: use Vercel integration OAuth for team/project access and store encrypted refresh credentials as organization data.
- Cloudflare: prefer OAuth/provider app flows where the relevant Cloudflare API supports them. If Worker secret management requires API tokens, use scoped API tokens only, make that method explicit, avoid global API keys, encrypt the token as organization data, and surface disconnect/revoke instructions.

This preserves the product goal: users connect and disconnect providers through app-connection lifecycle, not by scattering copied credentials through projects.

## Key Rotation

Key rotation is a first-class operating workflow. It should have plan, execute, resume, verify, and rollback-safe states, all visible in audit logs.

Rotation surfaces:

- Instance root key: generate new root material outside D1, then rewrap organization and project data keys.
- Organization data key: create a new key version, rewrap organization-level per-record DEKs or re-encrypt organization credentials, then mark the old key retired.
- Project data key: create a new key version and rewrap secret-version DEKs without decrypting plaintext secret values.
- Secret value: create a new secret version and make it current.
- Machine identity credential: rotate refresh/bootstrap credentials and invalidate the prior credential family.
- App connection credential: use provider refresh-token rotation or provider reauthorization where available; static scoped API tokens require explicit replacement.

Rotation requirements:

- Every encrypted record stores the key version needed to decrypt or rewrap it.
- Active keys encrypt new data; retired keys decrypt old data only during migration windows; revoked keys are unavailable except through an explicit emergency restore path.
- Rotation jobs are idempotent and resumable because Cloudflare Workers can be interrupted.
- Rotation never logs secret values, key bytes, DEKs, provider tokens, or decrypted credentials.
- Rotation produces machine-readable CLI output so agents can plan, execute, and verify without parsing prose.

## Tenancy

The target runtime isolation boundary is the organization. Every tenant-owned row should either carry `org_id` directly or be reachable only through an organization-owned parent. Project, environment, secret, secret version, app connection, secret sync, machine identity, and audit queries should all be organization-qualified.

The preferred route shape is organization-qualified:

```text
/v1/orgs/:org/projects
/v1/orgs/:org/projects/:project/envs
/v1/orgs/:org/projects/:project/envs/:env/secrets
/v1/orgs/:org/app-connections
/v1/orgs/:org/projects/:project/secret-syncs
```

The CLI may hide repeated organization/project flags through a committed local project config, but the API should never infer tenant context from an untrusted header or user-provided project slug alone.

Before treating `insecur.cloud` as a true multi-tenant service, add organization, membership, role, machine identity, app connection, secret sync, and tenant-qualified audit tables. Add regression tests that attempt cross-tenant reads and writes by ID and slug.

## CLI And Agent Ergonomics

The target CLI and sync workflow are specified in [cli-and-sync.md](cli-and-sync.md).

The CLI should remain easy for agents:

- `insecur init --org <org> --project <project> --env <env>` writes a non-secret `.insecur.json`.
- `insecur pull`, `insecur run`, and future `insecur sync` use `.insecur.json` defaults unless flags override them.
- Machine credentials can be supplied by environment variables, stored user config, or OIDC exchange; they should not be committed.
- Output modes should be scriptable: dotenv by default, plus `--json` for agents.
- Errors should be stable and specific enough for agents to recover without leaking tenant/resource existence.
- Mutating commands support `--dry-run` where possible and produce stable exit codes.
- Long-running operations such as sync and rotation return operation IDs that can be polled.
- Local config should be safe to commit; user credentials live in user config, environment variables, or provider/OIDC exchanges.
- The CLI should support profile selection for developers working across organizations.

## Implementation Order

1. Add organization, membership, role, and tenant-qualified audit model.
2. Move projects, environments, secrets, and secret versions under organizations.
3. Replace global human allowlist authorization with membership checks.
4. Introduce organization and project data keys.
5. Add key version tracking and root/data-key rotation workflows.
6. Serialize secret version writes and rollback so `current_version_id` cannot drift from the secret it belongs to under concurrent writers.
7. Replace long-lived machine tokens with machine identities and short-lived access tokens.
8. Add GitHub Actions OIDC exchange.
9. Add organization-owned app connections for Vercel, GitHub, and Cloudflare.
10. Add project-owned secret syncs that use app connections.
11. Add UI after API, CLI, and sync behavior are verified.

## Security References

The operational security plan lives in [security-plan.md](security-plan.md).

- RFC 9700, OAuth 2.0 Security Best Current Practice
- OWASP Authentication Cheat Sheet
- OWASP Session Management Cheat Sheet
- OWASP Application Security Verification Standard
- OWASP Multi-Tenant Application Security Cheat Sheet
- OWASP Secrets Management Cheat Sheet
- OWASP API Security Top 10 2023
- NIST SP 800-57 Part 1, Recommendation for Key Management
- NIST SP 800-218, Secure Software Development Framework
- GitHub Apps documentation
- Vercel Integration OAuth documentation
- Cloudflare API authentication documentation
