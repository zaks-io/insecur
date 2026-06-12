# ADR-0004: Machine Identities And CI Auth

Date: 2026-05-23

Status: Accepted

Machine access will use organization-owned machine identities that exchange an auth method for short-lived access tokens. V1 Machine Identity memberships are project-scoped only; organization-scoped machine memberships are deferred until organization-wide automation is needed. GitHub Actions OIDC is the preferred CI auth method because it avoids storing long-lived insecur tokens in GitHub; bootstrap client credentials are allowed only as a narrow fallback.

Deploy automation may use environment-scoped deploy keys for Runtime Injection when OIDC is unavailable. A deploy key belongs to one organization, project, and environment and is attached to an explicit allowlist of Runtime Policy Key IDs.

The Machine Identity is the actor for authorization. An Environment Deploy Key is an auth method for that Machine Identity, and the short-lived access token issued from it carries project/environment-bounded Credential Scopes. Machine credential effective access is the intersection of the Machine Identity's memberships, the credential's token scope, and the credential's Credential Scopes. This keeps the Authorization Scope vocabulary consistent with human access while avoiding broad role grants on deploy credentials.

Deploy key expiration and rotation are configurable through a Deploy Key Rotation Policy. Policies may set a hard expiration, rotation interval, reminder interval, or explicit non-expiring mode.

## Consequences

The existing long-lived machine token model is disposable learning code and must be replaced. The target model needs machine identity tables, auth method tables, scoped access tokens, credential rotation, trusted source constraints where practical, audit events for token exchange and reuse failures, and CLI support for non-interactive auth.

Deploy keys must not grant Secret Sync, arbitrary secret selection, arbitrary command execution, secret reveal, secret writes, promotion, rollback, app connection management, membership access, or cross-environment access. Secret Sync is server-side and uses App Connections for provider authorization. Deploy keys and bootstrap secrets must enter through safe sensitive input paths and must never be stored by the CLI.

The attached Runtime Injection Policy owns the exact secret bindings, command shape, Command Fingerprint requirement, TTL, and delivery behavior. A deploy key cannot override those constraints at exchange time.

Machine Identities cannot satisfy High-Assurance Challenges. They may create Blind Secret Writes that produce Draft Versions and may request Promotion if Organization Access allows it, and they may use exact Runtime Injection Policies or bounded operations already authorized by a User. They must not approve, complete Promotion, rollback, change retention, change Runtime Injection Policy, change Secret Sync, change App Connection, attach Shared Secret Sources, mutate Service Access, manage Signup Lockdown, or manage Tenant Suspension on their own.

Non-expiring deploy keys are allowed only when explicitly configured and must be visible as higher-risk in status, plan, and audit output. Deploy key create, exchange, denial, rotation, expiration, and disable events must be audited.

## Amendment (2026-06-12): `metadata:detail_read` is machine-forbidden in V1

Product-spec section 4 and ADR-0003 record that the Metadata Viewer Role grants scoped metadata detail visibility to humans only: Machine Identities do not receive that Built-In Role in V1, and the role's sole scope atom is `metadata:detail_read`. The atom therefore belongs in `MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES` alongside the other ADR-0004-forbidden capabilities already encodable today, so machine credential bundles cannot grant metadata detail reads even if a future edit adds the atom to `CREDENTIAL_SCOPES`. The registry and this amendment land together.
