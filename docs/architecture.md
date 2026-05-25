# Architecture

insecur is a Cloudflare-native, multi-tenant-capable secrets control plane for a Cloudflare, Vercel, and GitHub Actions stack. It borrows proven product ideas from larger secrets platforms, but keeps the implementation narrow: organization-scoped tenant isolation, one source of truth, scoped machine access, auditability, immutable versions, OAuth app connections, and platform sync.

## Product Boundary

The goal is not to clone a full enterprise secrets platform. The first-class use case is personal projects and relatively small groups with many projects, multiple users, and a focused stack that wants professional controls without long-lived containers or broad enterprise integrations.

V1 centers on one product spine: insecur stores the canonical secret versions, syncs derived values to Cloudflare, Vercel, and GitHub when native provider secrets are useful, and injects values just in time for deploys and local commands through the CLI. Agents should be able to cause approved secret use without reading Sensitive Values.

The flagship V1 promise is: let agents and CI use production secrets for approved deploy and runtime workflows without giving local agents or ordinary human sessions a read path to Protected Environment Sensitive Values.

V1 is the first production release, not a dev-only milestone or single-owner secret store. V1 targets Small-Group Production: valuable secrets for personal projects and relatively small trusted groups, backed by the Enterprise-Ready Model so later enterprise support does not require a tenant, authorization, audit, or key-boundary refactor. Public hostile-tenant onboarding, broad enterprise administration, and complex enterprise policy surfaces can mature after the core storage and delivery spine is excellent.

V1 is planned in two ordered milestones. The First Value Milestone gets an admitted user to provider-free Secret Use in a non-protected development Environment without waiting for provider setup or production delivery readiness. The Production Delivery Milestone adds the Storage Security Gate, Protected Environments, machine credentials, OIDC, provider App Connections, Secret Syncs, approvals, audit/export, and runbooks needed for Small-Group Production.

The product should use Misuse-Resistant Defaults: common management flows should be easy, while accidental Sensitive Value exposure through reveal, readback, export, logs, debug paths, or output modes should be structurally unavailable.

Hosted onboarding should make the first usable workspace appear without naming ceremony. When Public Onboarding admits a user, Guided Organization Provisioning creates a Personal Organization, Default Team, owner Membership, first Project, and non-protected development Environment with default Display Names. The Personal Organization is still a normal Organization: it can be renamed, extended, and grown through Invitations and Memberships without introducing a separate single-user product mode.

The first product-value moment should be provider-free and should use the real product commands. A First Value Proof uses service-side generation through `secrets set`, a Blind Secret Write, and explicit one-command secret selection through `run --secret-name` in the starter development Environment to show a secret can be used without putting the Sensitive Value in command output, local files, provider setup, or an agent transcript. This is a proof of delivery-without-reveal, not a claim that arbitrary local child processes cannot read injected development values.

Production Delivery should be policy-gated by risk tier. The secure default is that Protected Environment approval, High-Assurance Challenges, protected delivery configuration changes, protected Secret Sync enable/run, and Cloudflare Worker Secret Deploy approval evidence happen through the authenticated web app Human Approval Surface, while CLI/API callers may request, plan, and poll bounded operations. Delivery Risk Policy may allow agent-reachable CLI/API delivery for configured non-protected development or preview workflows, but V1 must not allow a Protected Environment production approval to be cleared solely through an agent-reachable channel.

V1 should expose Delivery Risk Policy as presets rather than a custom policy editor. Guided Organization Provisioning applies Balanced by default. Strict, Balanced, and Automation-Friendly are simple user-facing choices backed by versioned policy templates, scoped effective policy, migration behavior, and audit records so later enterprise policy surfaces can build on the same infrastructure.

Balanced allows non-protected development automation by default, but not blanket preview automation. Each non-protected preview Environment needs its own Preview Automation Opt-In before Agent-Reachable Channels can perform configured delivery actions for that environment. Automation-Friendly removes that per-environment opt-in step for non-protected preview Environments in scope. Both paths grant the same execution-only Preview Automation Authority: agents may run existing Runtime Injection Policies and existing Secret Syncs/Secret Sync Bindings, but may not create or change provider connections, connection boundaries, sync targets, runtime policies, provider targets, or the delivered Secret set.

Changing those presets and configured preview delivery authority is also policy-gated. Risk-broadening Delivery Changes require the Human Approval Surface and a High-Assurance Challenge. Risk-tightening changes may be completed by an authorized User in the authenticated web app without step-up, but remain audited. No preset change is completed solely through an agent-reachable channel in V1.

In scope:

- Cloudflare Workers API with Hyperdrive-backed Neon Postgres metadata storage and Postgres Row-Level Security
- Organization-first multi-tenancy with memberships and roles
- Bounded Onboarding: Instance Operator-created Organizations, Guided Organization Provisioning for Personal Organizations, and Invitation-based Organization Access
- Public tenant onboarding controls before any Hosted Instance enables broad public signup
- WebCrypto envelope encryption for secret versions and sensitive organization data
- WorkOS AuthKit for human authentication, MFA, and passkeys/TOTP
- Machine identities, short-lived access tokens, and GitHub Actions OIDC federation
- CLI profiles, runtime injection, and agent-safe deploy/local command execution
- OAuth app connections for Vercel, GitHub, and Cloudflare where providers support them
- Push sync targets for Vercel env vars, GitHub Actions secrets, and direct Cloudflare Worker secrets
- Audit log, version history, rollback, key rotation, credential rotation, and encrypted backups

Out of scope unless the product direction changes:

- SCIM, LDAP, SAML, PAM, and HSM integrations
- Dynamic database credentials across many database engines
- Long-lived Docker services
- Broad enterprise policy surfaces before the core stack is excellent
- Full public-hostile-tenant operations before broad public signup is enabled

## Infisical Lessons To Borrow

`~/src/infisical` is useful as a reference for shape, not scope. The patterns worth borrowing are:

- Organizations are the tenant root.
- Projects belong to organizations.
- Memberships are the normalized grant concept for users, teams, and machine identities, with subject-type constraints.
- V1 creates one non-authorizing default team per organization and avoids rich team management, nested teams, directory sync, and SCIM workflows.
- V1 invitation acceptance adds the user to the default team unless a future invitation workflow explicitly targets another team.
- The default team has no membership or role grant by default; invitation acceptance must create the explicit membership that grants access.
- A V1 invitation targets exactly one membership grant: either one organization-scoped role or one project-scoped role.
- Memberships attach users and teams to organization or project scopes, and V1 Machine Identities to project scopes only.
- Authorization is scope-first: Effective Access authorization scopes are evaluated for decisions, and roles are assignment presets that contribute scopes.
- V1 exposes built-in role presets only for User and Team assignment: owner, admin, developer, approval, and read-only. It does not expose arbitrary human/team scope editing.
- Built-in roles are authorization-scope bundles, so custom roles or explicit human/team scope assignments can be added later without changing authorization checks.
- The owner preset includes approval scopes for solo-owner operation. Admin and developer presets do not include approval scopes. The Approval Role is the additive preset for granting approval scopes to non-owners without project configuration, App Connection, Secret Sync configuration, Runtime Injection Policy, membership management, or Approval Request Cancellation authority.
- Organization-scope User and Team memberships contribute authorization scopes that apply across projects in the organization; project-scope memberships contribute narrower project-scoped authorization scopes.
- Approval scopes follow the same scope boundary: organization-scoped approval applies across projects in that organization, while project-scoped approval applies only to Approval Requests for Protected Environments in that project.
- User and Team memberships use built-in role presets in V1 and remain compatible with future explicit human/team scope grants; Machine Identity memberships carry explicit authorization scopes now.
- Machine Identity deploy access uses the same authorization-scope vocabulary, but an Environment Deploy Key is an auth method that issues short-lived credentials with project/environment-bounded Credential Scopes rather than a membership actor.
- Machine credential effective access is the intersection of Machine Identity memberships, credential token scope, and credential scopes.
- Machine identities are organization-owned, but V1 machine memberships are project-scoped; organization-scoped machine memberships are deferred until organization-wide automation is needed.
- Machine identities receive short-lived access tokens through auth methods.
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

Secrets are stored as immutable versions. The target encryption model uses project data keys for project secrets and organization data keys for organization-level sensitive data such as app connection credentials, machine identity auth method credentials, and Sensitive Metadata. Organization data keys are the baseline boundary for Sensitive Metadata; project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available. Those data keys are wrapped by instance key material stored in Cloudflare Secrets Store with offline escrow.

Secret encryption should use AES-256-GCM authenticated data that binds the ciphertext layer to immutable organization, project, environment, and secret identity. The DEK-wrap layer binds the data-key version; the Secret content version stays in Postgres metadata so rollback can copy ciphertext without decrypting it. This does not hide metadata, but it prevents ciphertext from being replayed or mis-bound across tenants or resources without detection.

Sensitive Metadata encryption should use AES-256-GCM authenticated data that binds ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity. Plaintext lookup/index fields should be limited to opaque resource IDs and Display Names.

Production delivery depends on this storage boundary. Secret Sync and Runtime Injection may be designed earlier, but production-capable delivery must fail closed until the [Storage Security Gate](storage-security-gate.md) passes. The gate is the metadata-only readiness interface over Keyring readiness, Tenant-Scoped Store/RLS readiness, ciphertext identity binding, encrypted Provider Credentials and Sensitive Metadata, and no-plaintext persistence.

No insecur-controlled durable surface may store plaintext secrets or provider credentials. That includes Neon Postgres, R2 backups, Queue payloads, Durable Object state, KV, operation records, audit metadata, caches, local config, logs, traces, and analytics. Plaintext may exist only as transient process memory inside approved encryption/decryption, rotation, sync, or runtime injection execution paths.

Human users authenticate through WorkOS AuthKit in the multi-tenant target. The current GitHub OAuth allowlist is disposable learning code and must be removed. Human login establishes identity and authentication assurance only; authorization comes from organization and project memberships.

Instance Bootstrap must configure enough Instance Identity Configuration for WorkOS AuthKit before a Bootstrap Operator Claim can complete. There is no temporary local-admin username/password path; the first Instance Operator is granted only to a WorkOS-authenticated User who also presents the Bootstrap Secret through a safe sensitive input path.

Bootstrap Operator Claim completion grants two separate authorities to the same User for the first usable setup path: Instance Operator for Instance administration, and an owner Membership in the first Organization for organization-scoped secret work. Those grants remain distinct and are audited separately.

Machine access should move from long-lived bearer tokens to machine identities that exchange an auth method credential for a short-lived access token. GitHub Actions OIDC should be the preferred CI path so GitHub stores no insecur token.

## Auth Requirements

Authentication and authorization should follow boring, current best practice:

- Authentication establishes the actor; authorization always checks membership, role, tenant, resource, and action.
- Human sessions use secure, HttpOnly, SameSite cookies, short idle/absolute lifetimes, CSRF protection for browser mutations, and session rotation after login or privilege changes.
- OAuth flows use authorization code flow, exact redirect URI matching, state, PKCE where supported, and mix-up defenses when more than one provider/issuer is involved.
- Provider authorization callbacks for App Connections are cross-tenant account-linking boundaries. Callback state binds one pending organization, user, app connection operation, connection method, and intended connection boundary.
- Provider authorization callbacks re-check Organization Access after the provider returns and verify the provider account, installation, team, repository, project, worker, or resource identity before storing credentials.
- Provider authorization callbacks fail closed when state is replayed, the user lost access, the organization is suspended, the operation was canceled or superseded, or the provider identity does not match the pending connection boundary.
- Access tokens are short-lived and scoped. Bearer tokens are accepted only in the `Authorization` header, never query strings.
- Human CLI credentials are memory/session-only by default. The CLI should not write access tokens, refresh tokens, session tokens, deploy keys, bootstrap secrets, or OIDC tokens to disk.
- Deploy keys are environment-scoped auth methods for Runtime Injection automation. A deploy key belongs to one organization, project, and environment, exchanges for a short-lived access token, and cannot grant cross-environment access or Secret Sync.
- Deploy keys are attached to Runtime Policy Key IDs and cannot choose their own secret set, command shape, or Command Fingerprint at exchange time.
- Deploy key expiration and rotation are configurable through a Deploy Key Rotation Policy; explicitly non-expiring keys are allowed but must be visible as higher-risk in status, plan, and audit output.
- Normal deploy key rotation may preserve the same active Auth Method; compromise-response rotation revokes, disables, or marks that Auth Method untrusted.
- Refresh credentials are rotated or sender-constrained where practical. Reuse of an invalidated refresh credential should revoke the credential family and create an audit event.
- MFA is required for human users before v1 production use. WorkOS AuthKit owns the human authentication path, with no SMS factor; use passkeys or TOTP-backed high-assurance sessions.
- High-Assurance Challenges are required for Sensitive Detail Gate, Protected Environment Approval Request approval/rejection, Promotion/rollback/import, Protected Approval Policy changes, protected Runtime Injection Policy changes, App Connection create/reauthorization/scope changes, Protected Environment Secret Sync create/enable/manual run, protected Secret Sync Binding changes, repository-scoped GitHub overrides, protected Shared Secret Source attachment, Push Device Registration creation/replacement, and mutating Service Access controls. Requester cancellation of a pending Approval Request does not require a High-Assurance Challenge because it only closes the request without delivery changes.
- Machine Identities cannot satisfy High-Assurance Challenges; they may create Blind Secret Writes and cancel their own pending Approval Requests if Organization Access allows it, and otherwise can use only exact policies or bounded operations previously authorized by a User.
- Bounded Onboarding is the V1 posture: Instance Operators can create Organizations, Public Onboarding can create Personal Organizations through Guided Organization Provisioning when enabled, and normal Users join existing Organizations through Invitations and Memberships.
- Public onboarding must have rate limits, abuse monitoring, tenant enumeration defenses, Tenant Suspension, and a Service Access controlled Signup Lockdown mode before broad public signup is enabled.
- Tenant Suspension is an organization-scoped containment state that blocks high-risk and cost-generating actions while preserving audit evidence and limited owner remediation access.
- Tenant Suspension closes pending Approval Requests in that Organization through Requester Access Staleness; reinstatement does not resume them automatically.
- Service Access may include decrypted Sensitive Metadata only after Sensitive Detail Gate, but must identify platform, audit, abuse, and operation state without Secret Reveal, Secret Delivery, Sensitive Values, or raw bodies.
- Break-glass recovery must be explicit, audited, limited to organization owners, and must not permit Protected Environment Secret Reveal.
- Denied authorization should not reveal whether a cross-tenant resource exists.

Authorization checks are object-level and tenant-qualified:

- The authenticated actor must resolve to an organization or project membership.
- Durable selectors use opaque resource IDs, not plaintext names or slugs.
- Every secret read/write checks organization, project, environment, optional path, and action.
- Every app connection read/use checks organization membership and, for secret syncs, project permission.
- Secret Sync provider writes are authorized through App Connections, not Environment Deploy Keys.
- Audit log writes include organization context, project context when applicable, typed actor/resource fields, request IDs, denied authorization events, and enough source metadata to support incident review.
- Audit metadata is allowlisted and never includes Sensitive Values, raw request bodies, raw provider bodies, or child process environments.
- Secret-bearing responses use `Cache-Control: no-store`.
- Sensitive Values are accepted only through safe sensitive input paths: request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows. They are never accepted in URLs, query strings, route params, CLI arguments, or GET requests.

For OAuth integrations, use authorization-code based provider flows with exact redirect URIs, one-time tenant-bound state, PKCE and nonce where supported, least-privilege scopes, encrypted refresh credentials, provider-side disconnect/revoke behavior, and provider/issuer mix-up defenses. The product should not ask users to paste scoped provider tokens when a provider supports an OAuth app or provider app installation model.

## Provider Connection Methods

App connections should have an explicit `method` field so provider differences are isolated behind a narrow interface. The default stance is OAuth/app-install first, manually created tokens only where a provider does not expose a suitable app installation flow for the required API.

- GitHub: use GitHub App installation for GitHub Actions secrets because installations have finer repository permissions and short-lived installation tokens. Protected production syncs should target existing GitHub Environment secrets inside the selected repository; insecur should not auto-create GitHub Environments for protected syncs and should block protected sync when the GitHub Environment has no visible protection rules. Repository-wide secrets require explicit override. Installation credentials are organization data and production use requires the Storage Security Gate.
- Vercel: use Vercel Integration OAuth for team/project access and environment-variable permissions. Store the resulting provider credential as encrypted organization data; production use requires the Storage Security Gate.
- Cloudflare: use a manually configured scoped Cloudflare API token with the minimum permission needed to update direct Worker secrets on explicit Worker script targets unless Cloudflare exposes a suitable app/OAuth install flow for that API. Reject global API keys, encrypt the token as organization data, and surface setup, rotation, disconnect, and revoke instructions. The app connection must declare its connection boundary pinning the account and allowed Worker script targets. Writing a Cloudflare Worker secret creates provider-side deploy impact for that Worker script/environment, so protected syncs must present the write as a production deploy in plan, approval, and audit output. Production use requires the Storage Security Gate.

This preserves the product goal: users connect and disconnect providers through app-connection lifecycle, not by scattering copied credentials through projects.

## Key Rotation

Key rotation is a first-class operating workflow. It should have plan, execute, resume, verify, and rollback-safe states, all visible in audit logs.

Rotation surfaces:

- Instance root key: generate new root material outside the Postgres metadata store, then rewrap organization and project data keys.
- Organization data key: create a new key version, rewrap organization-level per-record DEKs or re-encrypt organization credentials, then mark the old key retired.
- Project data key: create a new key version and rewrap secret-version DEKs without decrypting Sensitive Values.
- Secret value: create a new secret version; Protected Environments require explicit Promotion before the version is delivered.
- Machine identity credential: rotate refresh/bootstrap credentials and invalidate the prior credential family.
- App connection credential: use provider refresh-token rotation or provider reauthorization where available; static scoped API tokens require explicit replacement.

Rotation requirements:

- Every encrypted record stores the key version needed to decrypt or rewrap it.
- Active keys encrypt new data; retired keys decrypt old data only during migration windows; revoked keys are unavailable except through an explicit emergency restore path.
- Rotation jobs are idempotent and resumable because Cloudflare Workers can be interrupted.
- Rotation never logs Sensitive Values.
- Rotation produces machine-readable CLI output so agents can plan, execute, and verify without parsing prose.

Protected Environment secret changes use a release model owned by the [Protected Change Orchestrator](protected-change-orchestration.md). A Blind Secret Write creates a Draft Version; Promotion and Publish make exact reviewed changes live only after the current Approval Impact Review, Protected Approval Policy, High-Assurance Challenge, stale-state checks, and required approvals pass. The orchestrator keeps Promotion, protected delivery configuration changes, Approval Requests, Staged Change Sets, stale closures, Partial Approvals, and final apply in one metadata-only state machine while delivery still uses Published Versions only. Rollback creates a new Secret Version from a retained encrypted prior Published Version; there is no plaintext rollback copy.

## Tenancy

The target runtime isolation boundary is the organization. Every tenant-owned row should either carry `org_id` directly or be reachable only through an organization-owned parent. Project, environment, secret, secret version, app connection, secret sync, machine identity, and audit queries should all be organization-qualified.

The metadata store is Neon Postgres reached through Cloudflare Hyperdrive. Every metadata read and write goes through the Tenant-Scoped Store: it opens one short transaction, sets tenant scope transaction-local, and runs callers against a scoped handle. Postgres Row-Level Security is the engine backstop for metadata isolation; the Keyring remains the value boundary for Sensitive Values.

The preferred route shape is organization-qualified:

```text
/v1/orgs/:org/projects
/v1/orgs/:org/projects/:project/envs
/v1/orgs/:org/projects/:project/envs/:env/secrets
/v1/orgs/:org/app-connections
/v1/orgs/:org/projects/:project/secret-syncs
```

The CLI may hide repeated organization/project flags through a committed local project config that stores opaque IDs only. The API should never infer tenant context from an untrusted header, local cache, or client-provided ID without membership checks.

Before storing valuable secrets or treating `insecur.cloud` as production, add organization, membership, role, machine identity, app connection, secret sync, and tenant-qualified audit tables in Postgres with Row-Level Security policies. Add regression tests that attempt cross-tenant reads and writes by ID through both the Effective Access Resolver and the Tenant-Scoped Store.

## Audit Export Integrity

Audit exports are tenant-bounded JSONL artifacts with a simple tamper-evident proof. Each export should hash-chain canonicalized audit entries and include an HMACed manifest with organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC.

Audit export formats must distinguish full-fidelity security-review exports from low-privilege exports. Full-fidelity exports may include Sensitive Metadata such as Approval Context Notes, provider target names, and policy binding names only after authorization and Sensitive Detail Gate; low-privilege exports use immutable IDs, hashes, lengths, and presence flags and exclude that plaintext metadata. Historical Display Names may appear as ordinary audit metadata.

This is intentionally not a full compliance ledger. The HMAC verifies integrity and authenticity for systems that can access the verification key. If public third-party verification becomes a requirement, asymmetric signing should be added as a separate decision.

## CLI And Agent Ergonomics

The target CLI and sync workflow are specified in [cli-and-sync.md](cli-and-sync.md).

The CLI should remain easy for agents:

- `insecur init --org-id <id> --project-id <id> --env-id <id>` writes a non-secret `.insecur.json`.
- `insecur run <profile-id> -- <command>` and future `insecur sync` use `.insecur.json` defaults unless flags override them.
- CLI profiles reference organization, project, environment, and default runtime policy by opaque ID.
- V1 discovery uses Scoped Lists and Configured Selectors rather than general search over Sensitive Metadata.
- Display Names may be shown in authorized scoped list/detail responses without Sensitive Detail Gate. Provider-side secret or variable names used by Explicit Provider Lookup or Secret Sync Bindings are Sensitive Metadata and may be decrypted only after Sensitive Detail Gate.
- Machine credentials can be supplied by OIDC exchange, safe stdin input, or session-only environment variables; they should not be committed or stored in user config.
- Output modes should be scriptable and metadata-only; Secret values are delivered to approved destinations instead of returned to the caller.
- Agents can be granted Secret Use through Runtime Injection or Secret Sync without Secret Reveal.
- First Value Proof output must be metadata-only and provider-free, must use normal secret-write and runtime-injection commands rather than an onboarding-only command, and must not claim to prevent arbitrary child-process reads after Runtime Injection.
- Delivery Risk Policy Presets may allow agent-driven non-protected preview or development delivery, but Protected Environment approval and High-Assurance Challenges require the Human Approval Surface in V1.
- Agents may create Blind Secret Writes and request Promotion in Protected Environments when Organization Access allows it, but those writes create Draft Versions rather than changing live delivery.
- Draft Versions from rejected, canceled, superseded, policy-stale, requester-access-stale, or target-lifecycle-closed Approval Requests may be selected into a fresh Promotion Change Set only while they still exist in the Draft Area and the affected Project and Protected Environment still accept protected Promotion. The new request must recompute Approval Impact Review and collect fresh approvals; prior Approval Requests, Partial Approvals, impact reviews, snapshots, and approval screen state are audit-only and cannot be reused.
- Draft Version Discard removes an unpromoted Draft Version from the Draft Area without revealing the Sensitive Value or changing delivery. The User or Machine Identity that created the Draft Version may discard it while still authorized; scoped owner/admin users may discard drafts for cleanup. Discard is audited, terminal for that Draft Version, crypto-erases the encrypted Sensitive Value material immediately in V1, and retains tombstone/audit metadata for immutable approval facts and investigation. Human UI/CLI discard requires explicit destructive confirmation that shows metadata-only impact, including exact Draft Version IDs, affected pending Approval Request IDs, Partial Approvals becoming audit-only, and encrypted value material crypto-erasure, without showing Sensitive Values or decrypted Sensitive Metadata. That confirmation is bound to the computed impact and must be revalidated with actor Effective Access immediately before execution; if a draft was promoted, already discarded, removed from scope, or affects a different pending Approval Request set, UI/CLI must refresh impact and require fresh confirmation. API and Machine Identity discard require exact Draft Version IDs and are idempotent. Discard does not require an Approval Request or High-Assurance Challenge in V1. Any pending Approval Request whose Promotion Change Set includes the discarded Draft Version closes without Promotion while preserving Partial Approvals as audit-only. Discarded Draft Versions cannot be restored, cannot be used for Draft Version Reuse, and require a new Blind Secret Write plus new Draft Version if the same value is still wanted.
- Protected Approval Policy defaults to one approving User with a High-Assurance Challenge, and permits requester self-approval in that one-approval mode when the requester has approval scopes. A policy may optionally require a second distinct approving User; requester self-approval is denied whenever multiple approvals are required. Teams and overlapping memberships may grant approval scopes, but approval counts are per concrete User and one User counts at most once per Approval Request.
- A Protected Approval Policy change is a V1 high-assurance configuration mutation, not an Approval Request. It requires a User with owner/admin configuration scopes for the affected Project and Protected Environment plus a High-Assurance Challenge; approval scopes alone do not authorize it. The audit record includes before/after policy versions or hashes and any pending requests made policy-stale. Future enterprise support may add policy-change approval as a separate approval purpose.
- Changing the Protected Approval Policy for a Protected Environment makes any pending Approval Request for that environment policy-stale. Policy-stale requests close without Promotion or delivery changes, preserve Partial Approvals as audit-only, leave Draft Versions in the Draft Area, and require a fresh Approval Request under the new policy.
- If the requesting User or Machine Identity loses current authority for the affected Project and Protected Environment while an Approval Request is pending, the request becomes requester-access-stale. Short-lived machine credential expiry alone does not make a Machine Identity-created Approval Request stale. Normal Environment Deploy Key rotation also does not stale the request when it preserves the same active Auth Method. Durable authority changes do stale the request, including Machine Identity disablement, relevant membership or scope removal, Tenant Suspension, revocation/disablement of the Auth Method used for the request, or compromise-response rotation that marks that Auth Method untrusted. Tenant Suspension makes all pending Approval Requests in that Organization requester-access-stale rather than paused. Requester-access-stale requests close without Promotion or delivery changes, preserve Partial Approvals as audit-only, leave Draft Versions in the Draft Area, and require a fresh Approval Request from a currently authorized User or Machine Identity. Requester Access Staleness is terminal for that request; restored requester access or Organization reinstatement does not make it pending or approvable again.
- If the affected Project or Protected Environment is archived, deleted, or otherwise no longer accepts protected Promotion while an Approval Request is pending, the request closes terminally without Promotion or delivery changes. The request and Partial Approvals remain audit history only, and restoring or recreating the target requires a fresh Approval Request.
- Approval scopes are evaluated for the Project and Protected Environment affected by the Approval Request, and separately from admin/developer mutation scopes. Owner includes approval scopes; admin and developer do not, so a developer can request a protected change without being able to approve it.
- Machine Identities and Service Access cannot approve or reject customer Approval Requests. A Machine Identity may cancel only its own pending Approval Request with a currently valid machine credential and matching Effective Access for the affected Project and Protected Environment. A recorded User instruction is not required for V1 authorization.
- Approval confirmation may show Display Names after authorization, shows decrypted Sensitive Metadata only after Sensitive Detail Gate, treats optional Approval Context Notes as untrusted context, rejects stale impact reviews, and Promotion immediately enqueues every enabled Secret Sync affected by any promoted version when that sync impact was shown in the accepted Approval Impact Review. For Cloudflare Worker secrets, that review must label the exact Worker script and binding names as production deploy impact. Approval Notifications only point to this authenticated view and do not carry plaintext notes, display names, approval details, or email/push approval actions; push is the primary notification channel, not approval authority, and push payloads remain lock-screen safe.
- When an approval satisfies the Protected Approval Policy and causes Promotion, the accepted Approval Impact Review is persisted as an Approval Impact Snapshot. The snapshot is metadata-only, excludes Sensitive Values, keeps decrypted Sensitive Metadata behind Sensitive Detail Gate, and is the historical source of truth for the delivery and sync impact the final approver acted on.
- Partial Approvals record the Approval Impact Review Fingerprint they approved. They count toward the Protected Approval Policy only while the current Approval Impact Review Fingerprint matches and the approving User still passes current access revalidation. If Secret Delivery or Secret Sync impact changes before the threshold is satisfied, or the approving User is no longer active/currently authorized for the affected Project and Protected Environment, older Partial Approvals become audit-only and fresh approvals are required. A Partial Approval made audit-only by failed access revalidation stays audit-only even if that User later regains approval access; the User must approve again with current access, a fresh Approval Impact Review, and a new High-Assurance Challenge.
- Approval Notification deep links for approved, rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed Approval Requests still open the authenticated approval view, but show closed or stale state without approval, rejection, cancellation, Promotion, or delivery-changing actions for that request. In-app notifications should coalesce or update where possible; optional closure push/email alerts must stay metadata-safe and action-free.
- Closed or stale approval views may show original immutable request facts to currently authorized Users, including the Promotion Change Set, exact Draft Version IDs, status, actor IDs, timestamps, Partial Approvals, and closure, supersession, policy-stale, requester-access-stale, or draft-discard-closed state. Approval Context Notes and Approval Rejection Notes remain gated by Sensitive Detail Gate, and inspection never satisfies policy, reuses approvals, promotes, or changes delivery.
- Rejected, canceled, superseded, policy-stale, requester-access-stale, and draft-discard-closed Approval Requests do not require an Approval Impact Snapshot in V1. Their closed/stale views may show a clearly labeled Current Impact Preview for investigation, but recomputed impact is not historical approval evidence and cannot satisfy policy, reuse approvals, promote, or change delivery.
- Approval Request Rejection may include one optional Approval Rejection Note from the rejecting User. It is Sensitive Metadata, length-limited, escaped, hidden from low-privilege output except for IDs/hashes/lengths/presence flags, and not required by V1 Protected Approval Policy.
- Approval Request Cancellation closes a pending request without Promotion or delivery changes. A requesting User can cancel their own pending request with a normal authenticated session; a requesting Machine Identity can cancel its own pending request with a currently valid machine credential and matching Effective Access; and users with sufficient owner/admin configuration scopes for the affected Project and Protected Environment may cancel pending requests for cleanup. Machine cancellation audit records user instruction, task, and Agent run correlation when available, but that context is not the authorization source of truth in V1.
- Approval scopes alone do not authorize Approval Request Cancellation. A User with approval scopes who is neither the requester nor a scoped owner/admin cleanup actor must reject, not cancel, to close a request as a review outcome.
- Cancellation remains allowed after one or more Partial Approvals as long as the Approval Request is still pending, including Machine Identity own-request cancellation after human Partial Approvals. Partial Approvals are bound to one Approval Request and Promotion Change Set; cancellation preserves them in audit history but makes them unusable for delivery or later requests.
- Promotion approval is separate from protected delivery configuration approval; a single V1 Approval Request cannot both promote Draft Versions and create, enable, or change delivery targets.
- Protected Environment secrets do not support Secret Reveal, have no reveal UI/API/CLI/Service Access path, and deny file delivery.
- Protected Environment Runtime Injection is authorized by server-owned Runtime Injection Policies and short-lived Injection Grants, not local project config.
- Every Runtime Injection execution requires a fresh one-use Injection Grant; authenticated CLI sessions do not reuse grants across runs.
- Runtime Injection Policies use exact secret bindings only; wildcard or pattern-based secret selection is not supported.
- Runtime Injection Policy changes create immutable versions, and every Injection Grant references the exact Runtime Injection Policy Version used.
- Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata, separate from encrypted secret value rollback retention.
- Runtime Injection Policy Versions store immutable secret IDs and historical Display Names for incident reconstruction as ordinary metadata.
- Runtime Injection Policy Version Sensitive Metadata, such as provider-side names, policy binding names, and security-relevant relationships, is encrypted at rest, with opaque IDs kept available for lookup and audit joins.
- Exact Runtime Injection Policy bindings are required for forensic traceability: incident review must be able to reconstruct the policy key, Runtime Injection Policy Version, actor, command fingerprint, secret bindings, and delivered version IDs without plaintext.
- insecur does not capture or store stdout/stderr from runtime-injected commands. Audit records may store metadata, timing, exit code, and signal only.
- Dynamic Runtime Injection is the stronger high-sensitivity path when the workflow can support it because it avoids a persistent copy in GitHub, Vercel, or another provider secret store.
- Secret Sync remains a first-class compatibility path for native provider workflows, but it intentionally expands the storage boundary to the provider.
- Secret Sync uses exact Secret Sync Bindings from selected source Environment Secrets to provider-side secret or variable names; it does not sync every Secret in an Environment.
- Secret Sync does not support all-secrets, tag, prefix, suffix, regex, folder, or pattern-based selection.
- Sync planning may use cached provider metadata, but every sync run performs Sync Execution Revalidation immediately before Sensitive Value decrypt or provider writes.
- Sync Execution Revalidation checks Provider Account Linkage, credential scope, Connection Boundary, Sync Target identity, provider-side resource identity, required provider protection state, exact bindings, and source version eligibility.
- Provider Drift returns `sync.provider_drift`, blocks decrypt/write, and requires provider reauthorization or an approved configuration change before retry.
- Secret Sync is authoritative for exact bindings: it overwrites existing provider-side values for bound destinations without reading, comparing, or preserving the previous provider-side Sensitive Values.
- Removing a Secret Sync Binding deletes the provider-side secret or variable previously managed by that binding; disabling a Secret Sync leaves provider-side copies in place with warnings.
- Deleting a Secret Sync is destructive: it removes all bindings, attempts to delete all provider-side copies managed by those bindings, and tombstones the sync for audit.
- Provider cleanup failures during Secret Sync Deletion create user-visible Orphaned Managed Provider Copy warnings and retry metadata, but do not block the local sync tombstone.
- Secret Sync is one-way delivery. V1 verification checks provider metadata and status only; it never reads Sensitive Values back from provider secret stores, even if a provider API allows it.
- Secret Import is separate from sync verification and must use Safe Sensitive Input Paths, audit, and high-risk controls where appropriate. V1 Secret Import does not read Sensitive Values back from provider secret stores.
- Explicit Provider Lookup is metadata-only and exists only for bounded Secret Sync setup, planning, or approval operations with exact local intent. Its purpose is to check whether an exact Secret Sync Binding destination already exists and produce a Provider Overwrite Warning before sync approval or execution. Explicit Provider Lookup checks one exact configured provider-side name, target, or binding inside one App Connection and Connection Boundary; it must not list provider inventory, enumerate provider-side names, return unrelated provider objects, expose raw provider response bodies, expose provider-native error text, or read Sensitive Values. Lookup failures return stable Provider Lookup Status codes such as `provider.lookup_not_found`, `provider.permission_denied`, `provider.boundary_mismatch`, and `provider.unavailable`. Protected Environment Secret Sync setup, approval, enablement, and manual run fail closed with `provider.unavailable` when any exact binding lacks completed lookup status. Non-protected Secret Sync setup, enablement, and manual run may proceed after unavailable lookup status only with user-visible warning code `sync.overwrite_status_unknown`, operation-scoped confirmation, and an audit event. Provider-side names, target names, and existence status are Sensitive Metadata, decrypted only for authorized scoped output after Sensitive Detail Gate and never copied into plaintext indexes, logs, analytics, queue payloads, or unscoped caches. Explicit Provider Lookup does not create Secret Shapes, Secret Versions, Secret Syncs, Secret Sync Bindings, or placeholder records, and it does not perform Provider Sync Overwrite. Sync writes happen later only through the normal confirmation or approval flow after every binding has an eligible Current Version or Published Version.
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

The Tenant-Scoped Store backed by Neon Postgres is the source of truth for operation state, idempotency, audit events, and final results. Queue consumers perform provider writes, use delayed retries for retryable provider failures, and send exhausted failures to a dead-letter path for Service Access review.

Provider writes are serialized through a Durable Object execution gate keyed by organization, provider, and target identity. The Durable Object prevents concurrent sync runs from racing the same Vercel project, GitHub repository/environment, or Cloudflare Worker script/binding. It is coordination only; Postgres remains the audit and operation store.

The audit trail for a sync operation should include enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release events.

## Implementation Order

1. Add the Neon Postgres schema, Tenant-Scoped Store, Row-Level Security policies, organization, membership, role, and tenant-qualified audit model.
2. Move projects, environments, secrets, and secret versions under organizations.
3. Replace global human allowlist authorization with membership checks.
4. Introduce organization and project data keys.
5. Add key version tracking and root/data-key rotation workflows.
6. Bind the secret ciphertext layer to organization/project/environment/secret identity and bind the DEK-wrap layer to the data-key version with AES-GCM authenticated data.
7. Add the [Storage Security Gate](storage-security-gate.md) that blocks production Secret Delivery and Secret Sync until tenant-bound storage readiness is verified.
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
