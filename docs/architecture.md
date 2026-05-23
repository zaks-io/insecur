# Architecture

insecur is a Cloudflare-native, multi-tenant-capable secrets control plane for a Cloudflare, Vercel, and GitHub Actions stack. It borrows proven product ideas from larger secrets platforms, but keeps the implementation narrow: organization-scoped tenant isolation, one source of truth, scoped machine access, auditability, immutable versions, OAuth app connections, and platform sync.

## Product Boundary

The goal is not to clone a full enterprise secrets platform. The first-class use case is many projects and multiple users in a focused stack that wants professional controls without long-lived containers or broad enterprise integrations.

V1 centers on one product spine: insecur stores the canonical secret versions, syncs derived values to Cloudflare, Vercel, and GitHub when native provider secrets are useful, and injects values just in time for deploys and local commands through the CLI. Agents should be able to cause approved secret use without reading secret values.

V1 is the first production release, not a dev-only milestone. Even if the first real organization is Isaac's own organization, v1 must be public multi-tenant-capable from the start and assume hostile tenants, hostile automation, compromised credentials, confused-deputy attempts, and prompt-injected agents.

In scope:

- Cloudflare Workers API with D1 metadata storage
- Organization-first multi-tenancy with memberships and roles
- WebCrypto envelope encryption for secret versions and sensitive organization data
- WorkOS AuthKit for human authentication, MFA, and passkeys/TOTP
- Machine identities, short-lived access tokens, and GitHub Actions OIDC federation
- CLI profiles, runtime injection, and agent-safe deploy/local command execution
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

Secrets are stored as immutable versions. The target encryption model uses project data keys for project secrets and organization data keys for organization-level sensitive data such as app connection credentials, machine identity auth method credentials, and Sensitive Metadata. Organization data keys are the baseline boundary for Sensitive Metadata; project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available. Those data keys are wrapped by instance key material stored as Worker secrets.

Secret encryption should use AES-256-GCM authenticated data that binds ciphertext to organization, project, environment, secret, and version identity. This does not hide metadata, but it prevents ciphertext from being replayed or mis-bound across tenants or resources without detection.

Sensitive Metadata encryption should use AES-256-GCM authenticated data that binds ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity. Plaintext lookup/index fields should be limited to opaque resource IDs.

Production delivery depends on this storage boundary. Secret Sync and Runtime Injection may be designed earlier, but production-capable delivery must fail closed until the Storage Security Gate passes: root key material outside D1, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, and authenticated-data binding for encrypted secret, provider credential, and Sensitive Metadata records.

No insecur-controlled durable surface may store plaintext secrets or provider credentials. That includes D1, R2 backups, Queue payloads, Durable Object state, KV, operation records, audit metadata, caches, local config, logs, traces, and analytics. Plaintext may exist only as transient process memory inside approved encryption/decryption, rotation, sync, or runtime injection execution paths.

Human users authenticate through WorkOS AuthKit in the multi-tenant target. The current GitHub OAuth allowlist is scaffold-only. Human login establishes identity and authentication assurance only; authorization comes from organization and project memberships.

Machine access should move from long-lived bearer tokens to machine identities that exchange an auth method credential for a short-lived access token. GitHub Actions OIDC should be the preferred CI path so GitHub stores no insecur token.

## Auth Requirements

Authentication and authorization should follow boring, current best practice:

- Authentication establishes the actor; authorization always checks membership, role, tenant, resource, and action.
- Human sessions use secure, HttpOnly, SameSite cookies, short idle/absolute lifetimes, CSRF protection for browser mutations, and session rotation after login or privilege changes.
- OAuth flows use authorization code flow, exact redirect URI matching, state, PKCE where supported, and mix-up defenses when more than one provider/issuer is involved.
- Access tokens are short-lived and scoped. Bearer tokens are accepted only in the `Authorization` header, never query strings.
- Human CLI credentials are memory/session-only by default. The CLI should not write access tokens, refresh tokens, session tokens, deploy keys, bootstrap secrets, or OIDC tokens to disk.
- Deploy keys are environment-scoped auth methods for Runtime Injection automation. A deploy key belongs to one organization, project, and environment, exchanges for a short-lived access token, and cannot grant cross-environment access or Secret Sync.
- Deploy keys are attached to Runtime Policy Key IDs and cannot choose their own secret set, command shape, or Command Fingerprint at exchange time.
- Deploy key expiration and rotation are configurable through a Deploy Key Rotation Policy; explicitly non-expiring keys are allowed but must be visible as higher-risk in status, plan, and audit output.
- Refresh credentials are rotated or sender-constrained where practical. Reuse of an invalidated refresh credential should revoke the credential family and create an audit event.
- MFA is required for human users before v1 production use. WorkOS AuthKit owns the human authentication path, with no SMS factor; use passkeys or TOTP-backed high-assurance sessions.
- Break-glass access must be explicit, audited, and limited to organization owners.
- Denied authorization should not reveal whether a cross-tenant resource exists.

Authorization checks are object-level and tenant-qualified:

- The authenticated actor must resolve to an organization or project membership.
- Durable selectors use opaque resource IDs, not plaintext names or slugs.
- Every secret read/write checks organization, project, environment, optional path, and action.
- Every app connection read/use checks organization membership and, for secret syncs, project permission.
- Secret Sync provider writes are authorized through App Connections, not Environment Deploy Keys.
- Audit log writes include organization context, project context when applicable, typed actor/resource fields, request IDs, denied authorization events, and enough source metadata to support incident review.
- Audit metadata is allowlisted and never includes plaintext secret values, provider credentials, key material, raw request bodies, raw provider bodies, or child process environments.
- Secret-bearing responses use `Cache-Control: no-store`.
- Secret values, provider credentials, deploy keys, bootstrap secrets, and OIDC tokens are accepted only through safe sensitive input paths: request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows. They are never accepted in URLs, query strings, route params, CLI arguments, or GET requests.

For OAuth integrations, use authorization-code based provider flows with exact redirect URIs, state, PKCE where supported, least-privilege scopes, encrypted refresh credentials, and provider-side disconnect/revoke behavior. The product should not ask users to paste scoped provider tokens when a provider supports an OAuth app or provider app installation model.

## Provider Connection Methods

App connections should have an explicit `method` field so provider differences are isolated behind a narrow interface. The default stance is OAuth/app-install first, manually created tokens only where a provider does not expose a suitable app installation flow for the required API.

- GitHub: use GitHub App installation for GitHub Actions secrets because installations have finer repository permissions and short-lived installation tokens. Protected production syncs should target existing GitHub Environment secrets inside the selected repository; insecur should not auto-create GitHub Environments for protected syncs and should block protected sync when the GitHub Environment has no visible protection rules. Repository-wide secrets require explicit override. Installation credentials are organization data and production use requires the Storage Security Gate.
- Vercel: use Vercel Integration OAuth for team/project access and environment-variable permissions. Store the resulting provider credential as encrypted organization data; production use requires the Storage Security Gate.
- Cloudflare: use a manually configured scoped Cloudflare API token for Worker secret sync unless Cloudflare exposes a suitable app/OAuth install flow for Worker secret management. Reject global API keys, encrypt the token as organization data, and surface setup, rotation, disconnect, and revoke instructions. Cloudflare app connections may cover an account when provider permissions require it, but the app connection must declare its connection boundary, secret syncs must pin explicit Workers and environments, and sensitive projects should support stricter per-Worker connections. Production use requires the Storage Security Gate.

This preserves the product goal: users connect and disconnect providers through app-connection lifecycle, not by scattering copied credentials through projects.

## Key Rotation

Key rotation is a first-class operating workflow. It should have plan, execute, resume, verify, and rollback-safe states, all visible in audit logs.

Rotation surfaces:

- Instance root key: generate new root material outside D1, then rewrap organization and project data keys.
- Organization data key: create a new key version, rewrap organization-level per-record DEKs or re-encrypt organization credentials, then mark the old key retired.
- Project data key: create a new key version and rewrap secret-version DEKs without decrypting plaintext secret values.
- Secret value: create a new secret version; Protected Environments require explicit Promotion before the version is delivered.
- Machine identity credential: rotate refresh/bootstrap credentials and invalidate the prior credential family.
- App connection credential: use provider refresh-token rotation or provider reauthorization where available; static scoped API tokens require explicit replacement.

Rotation requirements:

- Every encrypted record stores the key version needed to decrypt or rewrap it.
- Active keys encrypt new data; retired keys decrypt old data only during migration windows; revoked keys are unavailable except through an explicit emergency restore path.
- Rotation jobs are idempotent and resumable because Cloudflare Workers can be interrupted.
- Rotation never logs secret values, key bytes, DEKs, provider tokens, or decrypted credentials.
- Rotation produces machine-readable CLI output so agents can plan, execute, and verify without parsing prose.

Protected Environment secret changes use a release model. `set` creates a Draft Version, Promotion makes a version eligible for Runtime Injection and Secret Sync, and rollback creates a new version from a retained encrypted prior Published Version. Retention is configurable and stores encrypted versions only; there is no plaintext rollback copy.

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

The CLI may hide repeated organization/project flags through a committed local project config that stores opaque IDs only. The API should never infer tenant context from an untrusted header, local cache, or client-provided ID without membership checks.

Before storing valuable secrets or treating `insecur.cloud` as production, add organization, membership, role, machine identity, app connection, secret sync, and tenant-qualified audit tables. Add regression tests that attempt cross-tenant reads and writes by ID.

## Audit Export Integrity

Audit exports are tenant-bounded JSONL artifacts with a simple tamper-evident proof. Each export should hash-chain canonicalized audit entries and include an HMACed manifest with organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC.

Audit export formats must distinguish full-fidelity security-review exports from low-privilege exports. Full-fidelity exports may include Sensitive Metadata such as historical secret/display names, provider target names, and policy binding names for authorized reviewers; low-privilege exports use immutable IDs and hashes and exclude that metadata.

This is intentionally not a full compliance ledger. The HMAC verifies integrity and authenticity for systems that can access the verification key. If public third-party verification becomes a requirement, asymmetric signing should be added as a separate decision.

## CLI And Agent Ergonomics

The target CLI and sync workflow are specified in [cli-and-sync.md](cli-and-sync.md).

The CLI should remain easy for agents:

- `insecur init --org-id <id> --project-id <id> --env-id <id>` writes a non-secret `.insecur.json`.
- `insecur run <profile-id> -- <command>` and future `insecur sync` use `.insecur.json` defaults unless flags override them.
- CLI profiles reference organization, project, environment, and default runtime policy by opaque ID.
- V1 discovery uses Scoped Lists and Configured Selectors rather than general search over Sensitive Metadata.
- Sensitive Display Names may be decrypted for authorized scoped list/detail responses, but they are not copied into plaintext search indexes.
- Machine credentials can be supplied by OIDC exchange, safe stdin input, or session-only environment variables; they should not be committed or stored in user config.
- Output modes should be scriptable and metadata-only; secret values are delivered to approved destinations instead of returned to the caller.
- Agents can be granted Secret Use through Runtime Injection or Secret Sync without Secret Reveal.
- Protected Environment secrets do not support Secret Reveal and deny file delivery by default.
- Protected Environment Runtime Injection is authorized by server-owned Runtime Injection Policies and short-lived Injection Grants, not local project config.
- Every Runtime Injection execution requires a fresh one-use Injection Grant; authenticated CLI sessions do not reuse grants across runs.
- Runtime Injection Policies use exact secret bindings only; wildcard or pattern-based secret selection is not supported.
- Runtime Injection Policy changes create immutable versions, and every Injection Grant references the exact Runtime Injection Policy Version used.
- Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata, separate from encrypted secret value rollback retention.
- Runtime Injection Policy Versions store immutable secret IDs and historical secret/display names as Sensitive Metadata for incident reconstruction.
- Runtime Injection Policy Version Sensitive Metadata is encrypted at rest, with opaque IDs kept available for lookup and audit joins.
- Exact Runtime Injection Policy bindings are required for forensic traceability: incident review must be able to reconstruct the policy key, Runtime Injection Policy Version, actor, command fingerprint, secret bindings, and delivered version IDs without plaintext.
- insecur does not capture or store stdout/stderr from runtime-injected commands. Audit records may store metadata, timing, exit code, and signal only.
- Dynamic Runtime Injection is the stronger high-sensitivity path when the workflow can support it because it avoids a persistent copy in GitHub, Vercel, or another provider secret store.
- Secret Sync remains a first-class compatibility path for native provider workflows, but it intentionally expands the storage boundary to the provider.
- The v1 runtime wrapper can be direct in-memory CLI injection into a forked child process; a separate local helper is only worth adding if it introduces a concrete security boundary.
- Command Fingerprints are required for Protected Environment Runtime Injection when practical, but the Runtime Trust Boundary starts when the approved child process receives its environment.
- Non-protected environments may share Secret Shapes with Protected Environments but must keep separate values.
- Shared values use explicit Shared Secret Sources with named environment attachments, never environment inheritance.
- Errors should be stable and specific enough for agents to recover without leaking tenant/resource existence.
- Mutating commands support `--dry-run` where possible and produce stable exit codes.
- Long-running operations such as sync and rotation return operation IDs that can be polled.
- Local config should be safe to commit; user credentials are memory/session-only and live in provider/OIDC exchanges, safe stdin flows, or session-only child environments.
- The CLI should support profile selection for developers working across organizations.

## Sync Execution Runtime

Secret sync runs are queue-backed operations. A request Worker creates an operation record, enqueues the sync work through Cloudflare Queues, and returns an operation ID instead of attempting all provider writes during the request.

D1 is the source of truth for operation state, idempotency, audit events, and final results. Queue consumers perform provider writes, use delayed retries for retryable provider failures, and send exhausted failures to a dead-letter path for operator review.

Provider writes are serialized through a Durable Object execution gate keyed by organization, provider, and target identity. The Durable Object prevents concurrent sync runs from racing the same Vercel project, GitHub repository/environment, or Cloudflare Worker. It is coordination only; D1 remains the audit and operation store.

The audit trail for a sync operation should include enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release events.

## Implementation Order

1. Add organization, membership, role, and tenant-qualified audit model.
2. Move projects, environments, secrets, and secret versions under organizations.
3. Replace global human allowlist authorization with membership checks.
4. Introduce organization and project data keys.
5. Add key version tracking and root/data-key rotation workflows.
6. Bind secret ciphertext to organization/project/environment/secret/version identity with AES-GCM authenticated data.
7. Add a Storage Security Gate that blocks production Secret Sync and Runtime Injection until tenant-bound encryption for Secrets, Provider Credentials, and Sensitive Metadata is verified.
8. Add Protected Environment Draft Version, Promotion, Published Version, rollback, and Rollback Retention Window behavior.
9. Serialize secret version writes, promotion, and rollback so published/current pointers cannot drift from the secret they belong to under concurrent writers.
10. Replace long-lived machine tokens with machine identities and short-lived access tokens.
11. Add GitHub Actions OIDC exchange.
12. Add CLI Profiles and policy-backed `insecur run <profile-id> -- <command>` for deploy and local runtime injection behind the Storage Security Gate.
13. Add organization-owned app connections for Vercel, GitHub, and Cloudflare.
14. Add project-owned secret syncs that use app connections behind the Storage Security Gate.
15. Add queue-backed sync execution with operation IDs, retries, dead-letter handling, and serialization for each provider target.
16. Add UI after API, CLI, and sync behavior are verified.

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
