# Security Plan

This document tracks the security plans insecur must account for while staying developer-first and agent-friendly. It is planning material, not a claim that the current disposable scaffold already implements these controls.

## Security Posture

insecur stores Sensitive Values, Sensitive Metadata, and audit records. The default posture should be conservative:

- Authenticate every actor.
- Authorize every object access through organization/project membership.
- Encrypt every Sensitive Value and Sensitive Metadata before Postgres persistence.
- Treat user-authored product names as Display Names: ordinary metadata visible after authentication and authorization.
- Never persist Sensitive Values on insecur-controlled systems.
- Never log Sensitive Values.
- Accept Sensitive Values only through safe sensitive input paths.
- Prefer short-lived credentials and provider app connections over copied static keys.
- Make every high-risk operation auditable, scriptable, resumable, and reversible where possible.
- Make secure behavior the easiest behavior for humans, agents, and CI.
- Avoid provider inventory discovery; provider-side checks use audited exact lookups for explicit configured or user-supplied targets only.
- Apply Misuse-Resistant Defaults: dangerous reveal or readback paths should be absent where possible, denied before decrypt where they must exist, and never reachable by accidental command shape.

V1 is split into First Value and Production Delivery milestones. First Value is limited to non-protected development values and provider-free Secret Use. V1 production use starts only after the Small-Group Production security baseline is implemented. V1 uses Bounded Onboarding for personal projects and relatively small trusted groups: Organizations are created by Instance Operators or controlled Guided Organization Provisioning, Personal Organizations start with an owner Membership, first Project, and non-protected development Environment for the admitted User, and normal Users join existing Organizations through Invitations and Memberships. It must still use the Enterprise-Ready Model: organization/project membership authorization, tenant-qualified audit, tenant-bound encryption, and object-level checks. Public hostile-tenant onboarding controls are required before broad public signup is enabled.

There is no supported unsafe pre-v1 product mode. Existing scaffold surfaces are deletion or replacement candidates, not compatibility constraints or product decisions.

The v1 security focus is secure storage plus controlled delivery: insecur is the Secret Source of Truth, provider syncs are derived delivery targets for Cloudflare, Vercel, and GitHub, and runtime injection delivers values just in time for deploys and local commands without writing local secret files.

Production Secret Delivery and Secret Sync are blocked until the [Storage Security Gate](storage-security-gate.md) passes. The gate is the metadata-only readiness contract for root key placement, tenant data keys, key versions, Tenant-Scoped Store/RLS, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and no-plaintext persistence.

## Threat Model

Primary assets:

- Secret values, secret versions, and other Sensitive Values.
- Organization data keys, project data keys, and per-record data encryption keys.
- App connection credentials for Vercel, GitHub, and Cloudflare.
- Machine identity auth method credentials and access tokens.
- Session cookies and refresh credentials.
- Audit log integrity.

Important attacker goals:

- Read secrets from another organization or project.
- Write or rollback secrets without permission.
- Use a stolen token after it should have expired or rotated.
- Abuse a provider connection to push or exfiltrate secrets.
- Abuse a provider connection as a metadata oracle to enumerate provider-side secrets, variables, repositories, environments, or project structure outside explicit insecur records.
- Replay ciphertext or move encrypted records across tenants.
- Suppress, forge, or evade audit records.
- Trick agents or CLI scripts into leaking secrets to stdout, JSON output, logs, shell history, model context, or committed files.
- Cause insecur to persist or log plaintext secrets through errors, audit metadata, provider responses, queues, caches, traces, or analytics.
- Smuggle Sensitive Values through URLs, query strings, route params, command arguments, shell history, browser history, process listings, or telemetry.
- Abuse expensive endpoints or sync jobs for denial of service.
- Register or control hostile tenants to probe tenant boundaries, quota behavior, onboarding flows, and public abuse defenses when broad public signup is enabled.
- Compromise the build/dependency supply chain.

Operating assumption about agents: assume any coding agent or automated caller running in an authorized session will read every Sensitive Value it can reach, including values delivered into a child process by Runtime Injection. Agent exposure to plaintext is controlled structurally rather than by agent restraint, and is tiered by environment: acceptable for non-protected development values, tightly controlled for Protected Environment values (typically staging and production).

Explicit non-goals for the near term:

- Enterprise identity surfaces such as SCIM, SAML, and LDAP.
- HSM/KMIP/FIPS modes.
- Broad dynamic secret engines.
- Large custom policy languages.

## Agent Access Model

A local coding agent has no identity of its own (ADR-0032). It runs inside a human-initiated session, inherits the short-lived `INSECUR_SESSION_TOKEN` from the process environment, and acts with the human's Effective Access. This model assumes the agent will read every Sensitive Value it can reach and will call the API directly with the inherited token rather than only through the CLI. Controls are therefore server-side on the token's risk tier, not CLI-side and not dependent on agent restraint.

What it holds: the session token, in its process environment. The token, not the CLI, is the capability. Anything the CLI can do with it, the agent can do by calling the API directly. The token is short-lived and cannot satisfy a High-Assurance Challenge, so the agent inherits exactly the human's autonomous Effective Access and nothing gated behind a fresh challenge.

What it can read as values: Runtime Injection is a read path. It delivers plaintext into a child process the agent controls, and the child can read its delivered environment once it crosses the Runtime Trust Boundary. Any Environment the agent can inject from, it can read in full, regardless of Secret Reveal being unavailable. A Protected Environment never offers Secret Reveal, but that is moot if the agent can trigger injection and print the delivered environment. On disk it can read only plaintext another tool left lying around, because insecur persists no plaintext secret to disk.

What it can read as metadata: freely, with normal authorized access, it reads Scoped Lists, Secret Shapes, Display Names, opaque IDs, counts, status, presence flags, lengths, and hashes. Decrypted Sensitive Metadata, such as provider-side names and security-relevant relationships, stays behind the Sensitive Detail Gate, which needs a fresh High-Assurance Challenge the agent cannot clear.

What it can do autonomously, within the human's Effective Access and with no fresh challenge: generate and set non-protected secrets, including server-side `--generate` where it never sees the value; assemble and read configuration; resolve Display Names through Scoped Lists; stage Draft Versions in a Protected Environment; and run non-protected development Runtime Injection.

What requires a human, failing closed with `auth.high_assurance_required` and exit code `10`: Promotion, protected rollback, Secret Import into a Protected Environment, Runtime Injection Policy create/update/publish/disable, Secret Sync enable or manual run, App Connection or Connection Boundary changes, protected Shared Secret Source attachment, and Push Device Registration.

Where the human step happens matters. Protected Environment approval, High-Assurance Challenge completion, protected delivery configuration approval, protected Secret Sync enable/run, and production Cloudflare Worker Secret Deploy approval evidence must happen in the authenticated web app Human Approval Surface in V1. The CLI/API path may request, plan, and poll the bounded operation, but it must not be sufficient to clear the protected production gate.

Delivery Risk Policy can deliberately allow non-protected development or preview delivery through agent-reachable channels. V1 exposes that choice through Delivery Risk Policy Presets: Strict, Balanced, and Automation-Friendly. Guided Organization Provisioning applies Balanced by default, and each preset is backed by versioned policy infrastructure with scope, effective policy, and audit history. Balanced allows non-protected development automation by default, but each non-protected preview Environment requires its own Preview Automation Opt-In. Automation-Friendly grants the same Preview Automation Authority by default for non-protected preview Environments in scope. Preview Automation Authority is execution-only for existing Runtime Injection Policies, Secret Syncs, and Secret Sync Bindings; adding provider targets, changing bindings or policies, or expanding the delivered Secret set requires a separate risk-broadening change. Risk-broadening changes require the Human Approval Surface and a High-Assurance Challenge; risk-tightening changes may use ordinary authenticated web app settings and still require audit. This is a configurable risk posture for lower-risk environments, not a shortcut around Protected Environment production approval.

The guided first-run proof must be worded narrowly. It may prove that insecur generated a development secret through a normal Blind Secret Write, stored it, delivered it to a verifier through normal Runtime Injection, and returned metadata-only success without exposing the Sensitive Value in CLI output, local files, or agent transcript. It must not claim that an arbitrary local agent cannot read non-protected development values after Runtime Injection gives them to a child process.

Seams this exposes:

- Runtime Injection, not Secret Reveal, is the real read boundary, because the child process the caller controls can read its delivered environment. Resolved by ADR-0038: issuing an Injection Grant for a Protected Environment requires a Machine Identity credential, a deploy key or OIDC identity, that lives in CI/CD and that the agent does not hold. A human session token, including the one an agent inherits, cannot obtain a Protected Environment Injection Grant, so the agent has no path to Protected Environment values. Creating or rotating that credential stays a High-Assurance Challenge action so the agent cannot mint its own.
- The token is the capability, not the CLI. Every boundary above must hold server-side against the raw token, because the agent can bypass the CLI. CLI-side nudges, such as preferring `--generate` or preferring injection over `.env`, are ergonomics, not controls.
- Non-protected development values are forfeit by design. The model accepts that the agent reads them, so a non-protected Environment must hold only development-grade values and never a production-grade Sensitive Value.

## Security Plans

### 1. Authentication And Session Plan

Use WorkOS AuthKit for human authentication, but treat login as identity and authentication assurance only. Authorization must come from organization and project memberships.

Plan for:

- WorkOS AuthKit hosted login or callback flow with exact redirect URI matching.
- `state` and PKCE where supported.
- Issuer/provider mix-up defenses if multiple OAuth providers are added.
- Provider authorization callbacks for App Connections are account-linking attack surfaces, not just OAuth plumbing.
- Secure, HttpOnly, SameSite cookies for browser sessions.
- CSRF protection on browser-originating mutations.
- Idle and absolute session lifetime limits.
- Session rotation after login, privilege changes, MFA changes, and recovery events.
- WorkOS-backed MFA is required before v1 production use.
- High-risk human actions require a High-Assurance Challenge: a fresh WorkOS passkey/TOTP challenge or equivalent high-assurance session.
- High-Assurance Challenge is required for Sensitive Detail Gate, Protected Environment Approval Request approval or rejection, Promotion, protected rollback, Secret Import into a Protected Environment, Runtime Injection Policy create/update/publish/disable for a Protected Environment, App Connection create/reauthorization/credential replacement/scope or Connection Boundary change, Protected Environment Secret Sync create/enable/manual run, protected Secret Sync Binding changes, repository-scoped GitHub Actions override from a Protected Environment, Shared Secret Source attachment to a Protected Environment, Push Device Registration creation/replacement, Risk-Broadening Delivery Changes, Protected Approval Policy changes, and mutating Service Access controls such as signup lockdown, tenant suspension, allowlists, reinstatement, or deletion escalation.
- Protected Environment approval and High-Assurance Challenge completion require the Human Approval Surface in V1; terminal-only approval is not supported for production protected gates.
- Delivery Risk Policy Presets default secure and may relax only non-protected development or preview delivery channels; Balanced preview relaxation requires environment-scoped Preview Automation Opt-In.
- Machine Identities cannot satisfy High-Assurance Challenges. They may create Blind Secret Writes, request Promotion, and cancel their own pending Approval Requests if Organization Access allows it, and otherwise may use only exact policies or operations already authorized by a User through a High-Assurance Challenge.
- A High-Assurance Challenge may authorize a bounded Operation ID for asynchronous execution, but it must not create reusable authority for future unrelated operations.
- Sensitive Detail Gate requires a fresh High-Assurance Challenge before any User-facing surface or full-fidelity export displays decrypted Sensitive Metadata. Normal authenticated sessions may see Display Names, opaque IDs, counts, status, hashes, lengths, presence flags, and generic pending states until the gate passes.
- Push Device Registrations are user-owned browser/mobile push registrations for Approval Notifications. They are Sensitive Metadata, scoped to one User and one device/browser/app installation, and never become authentication factors by themselves.
- Creating a new Push Device Registration, or replacing its device/browser/app installation or delivery endpoint, requires a High-Assurance Challenge. Push Device Registration create/update/delete events are audited. Users can revoke registrations from account security controls, and registrations are invalidated on logout-all, MFA reset, suspicious activity response, lost-device response, user offboarding, and membership removal where appropriate.
- Protected Approval Policy defaults to one approving User with a High-Assurance Challenge, and the owner preset includes approval scopes so a solo owner can operate V1.
- One-approval Protected Approval Policy permits requester self-approval when the requester has approval scopes and completes the High-Assurance Challenge.
- Protected Approval Policy may require a second distinct approving User for protected changes; when more than one approval is required, requester self-approval is denied.
- Protected Approval Policy changes are V1 high-assurance configuration mutations, not Approval Requests.
- Protected Approval Policy changes require a User with sufficient owner/admin configuration Authorization Scopes for the affected Project and Protected Environment plus a High-Assurance Challenge; approval scopes alone do not authorize them.
- Protected Approval Policy change audit records include actor, Organization, Project, Protected Environment, prior policy version or hash, new policy version or hash, and pending Approval Requests made policy-stale.
- Future enterprise support may add approval for Protected Approval Policy changes as a separate Approval Request purpose without changing promotion Approval Request semantics.
- Changing Protected Approval Policy for a Protected Environment makes any pending Approval Request for that environment policy-stale. The request closes without Promotion, Secret Delivery, Secret Sync, or delivery changes from that request.
- Policy-stale Approval Requests preserve Partial Approvals in audit history as audit-only, leave Draft Versions in the Draft Area, and require a fresh Approval Request under the new policy.
- Approval counts are per distinct User. A User counts at most once per Approval Request even when approval scopes come from multiple Memberships, Roles, or Teams.
- Teams may grant approval scopes through Membership, but Teams are not approval actors and cannot count as approvers.
- Approval scopes are separate from admin/developer mutation scopes. Admin and developer presets do not include approval scopes; a developer may request protected changes where their Effective Access allows, but cannot approve them without approval scopes.
- Approval scopes may be organization-scoped or project-scoped. Organization-scoped approval applies to Approval Requests for Protected Environments in any Project in that Organization; project-scoped approval applies only to Approval Requests for Protected Environments in that Project.
- Compromise of an approval-only account must not grant project configuration, App Connection, Secret Sync configuration, Runtime Injection Policy, membership management, or Approval Request Cancellation authority.
- Machine Identities and Service Access cannot approve or reject customer Approval Requests. A Machine Identity may cancel only its own pending Approval Request with a currently valid machine credential and matching Effective Access for the affected Project and Protected Environment. A recorded User instruction is not required for V1 machine own-request cancellation authorization.
- SMS is not allowed as a primary or recovery MFA factor.
- Initial MFA should use WorkOS AuthKit passkeys or TOTP-backed high-assurance sessions.
- Insecur user records should map to stable WorkOS user identifiers, not mutable emails.
- Recovery should use recovery codes, organization-owner recovery, or audited break-glass recovery instead of SMS fallback.
- Explicit, audited break-glass recovery is limited to organization owners and does not permit Secret Reveal for Protected Environment secrets.
- V1 Bounded Onboarding requires controlled Organization creation through Instance Operators or Guided Organization Provisioning, plus Invitation-based Organization Access for existing Organizations.
- Guided Organization Provisioning creates a Personal Organization, owner Membership, first Project, and non-protected development Environment without requiring the admitted User to name or configure each object before first value.
- Instance Bootstrap creates the first Instance, Instance Configuration, Organization, and Bootstrap Operator Claim before normal authentication-dependent administration is available.
- Instance Bootstrap must configure enough Instance Identity Configuration for WorkOS AuthKit before Bootstrap Operator Claim completion is possible.
- Bootstrap Operator Claim completion requires both a Human Identity Provider-authenticated User and the Bootstrap Secret through a safe sensitive input path.
- Bootstrap Operator Claim completion grants Instance Operator and first-Organization owner Membership as separate audited authorities.
- The first successful Human Identity Provider login never receives Instance Operator by default.
- Temporary local-admin username/password authentication is not a supported bootstrap path.
- Public onboarding must include rate limits, abuse monitoring, and a Service Access controlled signup lockdown mode before broad public signup is enabled.
- Signup lockdown must be able to restrict new public onboarding without weakening authentication, authorization, audit, or tenant isolation for existing organizations.
- Signup lockdown blocks new User creation, Guided Organization Provisioning, public Organization creation, and unauthenticated Invitation acceptance by default.
- During signup lockdown, existing Users can still log in with MFA and use existing Memberships.
- During signup lockdown, organization owners can create Invitations only for existing Users by default; other Invitations stay pending until lockdown is lifted.
- Service Access may permit specific domains or Invitation IDs during signup lockdown, and every allowlist decision is audited.
- Tenant Suspension is the organization-scoped containment path for abuse, suspected leak response, or provider misuse.
- Tenant Suspension must preserve evidence and limited owner remediation access instead of deleting tenant data.
- Service Access must support investigation and audit without Secret Reveal, Secret Delivery, Sensitive Values, raw request bodies, or raw provider bodies.
- Service Access may inspect platform health, safe audit metadata, decrypted Sensitive Metadata after Sensitive Detail Gate, operation state, rate-limit events, signup lockdown state, tenant suspension state, abuse signals, and provider error summaries.
- Service Access must not issue Injection Grants, run Secret Syncs, create Memberships, manage App Connections, decrypt Sensitive Values, or reveal Protected Environment secrets.
- Service Access to decrypted Sensitive Metadata must pass Sensitive Detail Gate, be reason-coded, and be audited.

Agent/DX requirements:

- CLI auth must work in non-interactive environments.
- Browser login may exist for humans, but CI and agents should use OIDC or a narrow bootstrap auth method.
- Human CLI credentials are memory/session-only; no access token, refresh token, or session token is written to disk.
- The CLI may launch an authenticated subshell or one-shot command with a short-lived token in the child environment, but must not persist that token.
- Deploy automation may use environment-scoped deploy keys for Runtime Injection. Deploy keys exchange for short-lived access tokens and cannot cross project or environment boundaries.
- Deploy keys are attached to an explicit allowlist of Runtime Policy Key IDs.
- Deploy keys cannot request arbitrary secrets, secret sets, command shapes, or Command Fingerprints.
- Runtime Injection Policies own the deployable secret set and command boundary.
- Deploy keys must not authorize Secret Sync. Secret Sync is server-side and uses App Connections for provider authorization.
- Environment deploy key expiration and rotation are configurable through a Deploy Key Rotation Policy.
- Normal deploy key rotation may preserve the same active Auth Method; compromise-response rotation must revoke, disable, or mark the Auth Method untrusted when pending machine-created Approval Requests should become requester-access-stale.
- Non-expiring deploy keys are allowed only when explicitly configured and visible in status, plan, and audit output.
- Deploy key create, exchange, denial, rotation, expiration, and disable events are audited.
- Auth errors need stable machine-readable codes such as `auth.expired`, `auth.insufficient_scope`, `auth.reauth_required`, and `auth.high_assurance_required` for a fresh High-Assurance Challenge gate on a high-risk action. `auth.mfa_enrollment_required` is reserved for the distinct case where the human has no eligible factor enrolled; the action-boundary step-up does not use `auth.mfa_required`.
- Non-interactive CLI and CI flows must never depend on human SMS verification.

### 2. Authorization And Tenancy Plan

Object-level authorization is the main security boundary. Plaintext slugs or names are not v1 durable selectors and must not replace membership checks.

Plan for:

- Organization-qualified routes.
- Opaque resource IDs for durable server-side selectors.
- Display Names are ordinary metadata, not Sensitive Values or Sensitive Metadata.
- Scoped list/detail endpoints may show Display Names after authorization without Sensitive Detail Gate.
- Membership checks for every list, read, write, rollback, token, audit, app connection, and sync operation.
- Scope-first authorization checks at organization and project scope.
- Built-in role preset assignment for V1: owner, admin, developer, approval, and read-only.
- Built-in roles are evaluated as Authorization Scope bundles; arbitrary human/team scope editing and custom role management are deferred until after V1.
- The owner preset includes approval scopes. Admin and developer presets do not.
- The Approval Role contributes approval scopes to non-owners where Protected Approval Policy allows them, without contributing project configuration, App Connection, Secret Sync configuration, Runtime Injection Policy, membership management, or Approval Request Cancellation authority.
- Approval attempts evaluate Effective Access for the Project and Protected Environment affected by the Approval Request; notification receipt and membership in another Project do not grant approval authority.
- Membership is the normalized grant concept for Users, Teams, and Machine Identities, with subject-type constraints.
- V1 creates one non-authorizing Default Team per Organization; richer team management, nested teams, directory sync, and SCIM workflows are deferred.
- V1 Invitation acceptance adds the User to the Default Team unless a future Invitation workflow explicitly targets another Team.
- Default Team association does not grant Organization Access by itself; explicit Memberships grant access.
- A V1 Invitation targets exactly one Membership grant: either one organization-scoped Role or one project-scoped Role.
- User and Team organization-scope memberships contribute Authorization Scopes that apply across projects in that Organization; project-scope memberships contribute narrower project-scoped Authorization Scopes.
- User and Team memberships use built-in Role presets in V1 and remain compatible with future explicit human/team Authorization Scope grants; Machine Identity memberships carry explicit Authorization Scopes now.
- V1 Machine Identity memberships are project-scoped only; organization-scoped machine memberships are deferred.
- Machine Identity deploy automation uses project/environment-bounded Credential Scopes on short-lived credentials; Environment Deploy Keys are auth methods, not membership actors.
- User and Team effective access is additive in V1; deny rules and negative overrides are out of scope.
- Machine credential effective access is the intersection of Machine Identity memberships, credential Token Scope, and Credential Scopes.
- Deny-by-default permission evaluation.
- Identical public behavior for missing resources and cross-tenant forbidden resources.
- Cross-tenant regression tests for ID-based access, missing resources, and forbidden resources.
- Safe invitation and membership removal behavior.
- Tenant-bounded audit export and tenant deletion.

Agent/DX requirements:

- `.insecur.json` stores non-secret defaults using opaque IDs only: host, organization ID, project ID, environment ID, and optional profile ID.
- API authorization must never trust client-provided IDs without tenant-qualified lookup and membership checks.
- CLI commands should not require repeating organization/project/env flags after `insecur init`.
- CLI errors should explain the missing permission without revealing cross-tenant resource existence.

### 3. Cryptography And Key Management Plan

Encryption should provide tenant isolation and support routine rotation.

Plan for:

- Instance root key material stored outside the Postgres metadata store.
- Organization data keys for organization-level encrypted data.
- Project data keys for project secret data.
- Organization data keys are the baseline boundary for Sensitive Metadata. Project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available.
- Per-record or per-version data encryption keys where useful.
- Key version records with `active`, `retired`, and `revoked` states.
- AES-256-GCM authenticated data binding the Secret ciphertext layer to organization, project, environment, and secret identity, with the DEK-wrap layer binding the data-key version.
- AES-256-GCM authenticated data binding provider credential ciphertext to organization, app connection, provider, credential, and key version identity.
- AES-256-GCM authenticated data binding Sensitive Metadata ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity.
- Plaintext lookup/index fields are limited to opaque resource IDs and Display Names. Approval Context Notes, Approval Rejection Notes, Push Device Registrations, provider target names, provider-side secret or variable names used by Explicit Provider Lookup or Secret Sync Bindings, policy binding names, and security-relevant relationships are encrypted Sensitive Metadata.
- V1 does not include general search over Sensitive Metadata. Identification uses Scoped Lists, Configured Selectors, opaque IDs, Display Names, and authorized detail views.
- Display Names may be used for scoped lookup and list filtering after authorization. Sensitive Metadata must not be copied into plaintext search indexes.
- Rotation that rewraps data keys or per-record DEKs instead of exposing Sensitive Values.
- Draft Version Discard must crypto-erase discarded draft value material immediately by deleting ciphertext and/or destroying version-specific decryptability while retaining tombstone/audit metadata only.
- Emergency restore path that can decrypt retired keys under explicit Service Access control.
- Key rotation audit events and verification reports.
- [Storage Security Gate](storage-security-gate.md) verification before production Secret Delivery or Secret Sync can be enabled.
- Production app connection credential storage and use require organization data keys, key versions, and authenticated-data binding.

Agent/DX requirements:

- `insecur keys plan-rotation --json` shows scope, affected records, and expected steps.
- `insecur keys rotate --operation <id>` is resumable and idempotent.
- `insecur keys verify --operation <id> --json` returns machine-readable status.
- No Sensitive Values ever appear in CLI output.
- Delivery features must fail closed until tenant-bound encryption for Secrets, Provider Credentials, and Sensitive Metadata is verified. Development-only prototypes must not become supported unsafe product paths.

### 4. Secret Lifecycle Plan

Secrets need lifecycle operations beyond CRUD.

The canonical protected-change state machine lives in [protected-change-orchestration.md](protected-change-orchestration.md). This section lists the security requirements that state machine must satisfy.

Plan for:

- Immutable secret versions.
- Serialized writes and rollback.
- Rollback implemented as a new version created from an older encrypted payload.
- Blind Secret Writes that create Secret Versions without returning Sensitive Values to the caller.
- Service-side generation for random credentials so an Agent can request a value without seeing it.
- Blind Secret Write is the normal write flow with metadata-only output; service-side generation is an option on that flow, not a separate Secret type.
- Protected Environment writes create Draft Versions until explicitly promoted.
- Protected Environment Blind Secret Writes create Draft Versions; they do not create a separate approval surface and do not affect Runtime Injection or Secret Sync until Promotion is approved.
- Each Protected Environment has a Draft Area that can contain unpromoted Draft Versions while an Agent prepares changes for review.
- Non-protected Environment Blind Secret Writes may update the Current Version immediately according to that Environment policy.
- Promotion requests for Protected Environments create immutable Promotion Change Sets and Approval Requests.
- A Promotion Change Set contains exact Draft Version IDs in one Protected Environment. It must not support wildcard, query, tag, pattern, or "all staged changes" selection.
- Draft Versions created after an Approval Request are not added to that request; they remain in the Draft Area until included in a later Promotion Change Set.
- Approval Requests notify authorized approvers and contain metadata only: actor, Promotion Change Set ID, secret IDs, Draft Version IDs, generation methods, target Environment, optional Approval Context Note, and safe diff/status data.
- Approval Notifications are out-of-band alerts, not approval review surfaces. They include only low-privilege server-generated metadata such as Approval Request ID, generic purpose, created time, and a non-authorizing link to the authenticated approval view.
- Approval Notifications must not include Approval Context Note plaintext, Sensitive Values, Display Names such as organization/project/environment/secret names, decrypted Sensitive Metadata such as provider target names, provider-side names, policy binding names, security-relevant relationships, raw bodies, or approval impact details.
- Notification links must not be bearer approval tokens. They route to the authenticated approval view, which performs normal authorization and Sensitive Detail Gate before decrypting any Sensitive Metadata.
- Approval Notification channels may include in-app notifications, browser push, mobile push through a Capacitor-wrapped web app, email, or future channels.
- Browser push and mobile push through Push Device Registrations are the Primary Approval Notification Channel when available. In-app notifications and email are fallback channels.
- Browser/mobile push payloads must be safe for lock screens, notification centers, browser push services, APNs/FCM, and other third-party notification infrastructure. They may contain only generic approval-pending text, opaque request references, created time, and non-authorizing deep links.
- Browser push and mobile push may deep-link into the authenticated web app approval view, but they must not approve, reject, or satisfy High-Assurance Challenge by themselves.
- If push delivery fails or no valid Push Device Registration exists, the Approval Request remains pending and visible in the authenticated app; fallback notifications may be sent without relaxing approval requirements.
- Email Approval Notifications are supported only as alerts. They must not include approve, reject, or other approval action links because email is a phishing-prone approval surface.
- Approval Notification deep links for approved, rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed Approval Requests must resolve to the authenticated approval view and show closed or stale state with no approval, rejection, cancellation, Promotion, or delivery-changing action for that request.
- Closed or stale approval views may show original immutable Approval Request facts to currently authorized Users, including Promotion Change Set, exact Draft Version IDs, status, actor IDs, timestamps, Partial Approvals, and closure, supersession, policy-stale, requester-access-stale, or draft-discard-closed state.
- Closed or stale approval views may show Approval Context Notes and Approval Rejection Notes only after authorization and Sensitive Detail Gate.
- Inspecting closed or stale approval views must not satisfy Protected Approval Policy, create or reuse Partial Approvals, create Promotion, change Secret Delivery, change Secret Sync, or change protected delivery configuration.
- In-app Approval Notifications should coalesce or update when an Approval Request is approved, rejected, canceled, superseded, made policy-stale, made requester-access-stale, or closed after Draft Version Discard. Optional closure push/email alerts must use the same metadata-safe generic payload constraints and must not include action links.
- Approval Context Notes may be supplied by a User or Agent to explain intent, but are untrusted text: length-limited, escaped for display, visually separated from server-generated facts, and never rendered as HTML or active-link markdown.
- Approval Context Notes are Sensitive Metadata. They are encrypted at rest, decrypted only after authorization and Sensitive Detail Gate for approval views or full-fidelity security review, and excluded from plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, and error messages.
- Low-privilege audit exports and low-privilege operation output represent Approval Context Notes with immutable IDs, hashes, lengths, or presence flags rather than plaintext.
- Approval Context Notes must not be used to choose Draft Versions, choose delivery targets, suppress warnings, satisfy approval requirements, or drive policy decisions.
- Approval screens must render server-generated Promotion Change Set and Approval Impact Review facts as the approval source of truth. The Approval Context Note can help a human understand intent, but it is not authoritative.
- Approval Requests do not expire by age in V1. They remain pending until approved, rejected, canceled, superseded, made policy-stale by a Protected Approval Policy change, made requester-access-stale by requester access loss, or closed because Draft Version Discard removed a Draft Version in the Promotion Change Set.
- Requester Access Staleness closes a pending Approval Request without Promotion, Secret Delivery, Secret Sync, or protected delivery configuration changes when the requesting User or Machine Identity no longer has current authority for the affected Project and Protected Environment.
- Requester Access Staleness applies when the requesting User loses Organization Access, is suspended, or is offboarded before the Approval Request completes.
- Requester Access Staleness applies when the requesting Machine Identity is disabled, loses Organization Access, or no longer has authorization for the affected Project and Protected Environment before the Approval Request completes.
- Short-lived machine credential expiry does not cause Requester Access Staleness by itself.
- For Machine Identity-created Approval Requests, Requester Access Staleness applies when durable authority changes before approval completes, including Machine Identity disablement, relevant Membership or Authorization Scope removal, Tenant Suspension, or revocation or disablement of the Auth Method used for the request.
- Normal Environment Deploy Key rotation that preserves the same active Auth Method does not cause Requester Access Staleness by itself.
- Environment Deploy Key rotation caused by compromise response causes Requester Access Staleness when it revokes, disables, or marks untrusted the Auth Method used for the pending Approval Request.
- Tenant Suspension makes all pending Approval Requests in the suspended Organization requester-access-stale instead of paused.
- Requester Access Staleness preserves Partial Approvals in audit history as audit-only, leaves Draft Versions in the Draft Area, and requires a fresh Approval Request from a currently authorized User or Machine Identity if the change is still wanted.
- Requester Access Staleness is terminal for that Approval Request; later requester access restoration must not make the stale request pending or approvable again.
- Reinstatement after Tenant Suspension must not make requester-access-stale Approval Requests pending or approvable again.
- A requesting User or Machine Identity that regains access may create a fresh Approval Request with current authority and a fresh Approval Impact Review.
- If the affected Project or Protected Environment is archived, deleted, or otherwise no longer accepts protected Promotion before the Approval Request completes, the pending Approval Request must close without Promotion, Secret Delivery, Secret Sync, or protected delivery configuration changes.
- Approval Requests closed by target lifecycle changes preserve audit history, make Partial Approvals audit-only, and must not become pending or approvable again if the target is restored or recreated.
- Draft Versions from rejected, canceled, superseded, policy-stale, requester-access-stale, or target-lifecycle-closed Approval Requests may be selected into a fresh Promotion Change Set only while those Draft Versions still exist in the Draft Area and the affected Project and Protected Environment still accept protected Promotion.
- Draft Version reuse requires a new Approval Request, new Approval Impact Review, and fresh approvals; the prior Approval Request, Partial Approvals, Approval Impact Review, Approval Impact Review Fingerprint, Approval Impact Snapshot, and approval screen state must remain audit-only and unusable for authorization.
- Draft Version Discard removes an unpromoted Draft Version from the Draft Area without revealing Sensitive Values and without causing delivery changes.
- The User or Machine Identity that created the Draft Version may discard it while current Effective Access still covers the affected Project and Protected Environment; scoped owner/admin users may discard drafts for cleanup.
- Draft Version Discard is audited and does not require an Approval Request or High-Assurance Challenge in V1.
- Human UI and CLI Draft Version Discard require explicit destructive confirmation that is operation-scoped, discard-specific, and not reusable for later operations.
- Human Draft Version Discard destructive confirmation must show metadata-only impact before execution: exact Draft Version IDs, affected pending Approval Request IDs, that affected Approval Requests close without Promotion, that existing Partial Approvals become audit-only, and that encrypted Sensitive Value material will be crypto-erased.
- Draft Version Discard destructive confirmation must not show Sensitive Values, decrypted Sensitive Metadata, Approval Context Notes, or Approval Rejection Notes.
- The service must bind human Draft Version Discard destructive confirmation to the exact computed metadata-only impact.
- The service must revalidate the confirmed Draft Version Discard impact and actor Effective Access immediately before execution.
- If any selected Draft Version was promoted, already discarded, removed from the actor's authorized scope, or has a changed affected pending Approval Request set before execution, the stale destructive confirmation must not execute and UI/CLI must require refreshed impact plus fresh confirmation.
- API and Machine Identity Draft Version Discard require exact Draft Version IDs; wildcard, query, tag, pattern, or "all drafts" selection is not supported.
- Draft Version Discard is idempotent for exact discarded Draft Version IDs: repeated requests observe the terminal discarded state and must not restore value material, reopen closed Approval Requests, or create Promotion.
- Draft Version Discard is terminal for the discarded Draft Version; it cannot return to the Draft Area or become promotable again.
- Draft Version Discard crypto-erases the discarded Draft Version's encrypted Sensitive Value material immediately in V1.
- Draft Version Discard retains tombstone and audit metadata needed for immutable approval facts, pending-request closure, audit export integrity, and investigation, but the discarded Sensitive Value must be unrecoverable by product, admin, support, or restore flows.
- If a pending Approval Request includes a discarded Draft Version in its Promotion Change Set, the Approval Request closes without Promotion, Secret Delivery, Secret Sync, or protected delivery configuration changes; existing Partial Approvals become audit-only; the closed request cannot be approved/rejected/canceled.
- Discarded Draft Versions cannot be selected through Draft Version reuse. If the same Sensitive Value is still wanted, the actor must create a new Blind Secret Write and new Draft Version.
- Approval Request Rejection requires approval scopes for the affected Project and Protected Environment plus a High-Assurance Challenge.
- Approval Request Rejection closes the request without Promotion, Secret Delivery, Secret Sync, or protected delivery configuration changes.
- Approval Request Rejection leaves Draft Versions in the Draft Area so the requester can create a later Promotion Change Set and Approval Request.
- Approval Request Rejection may include one optional Approval Rejection Note from the rejecting User.
- V1 Protected Approval Policy does not require an Approval Rejection Note.
- Approval Rejection Notes are Sensitive Metadata. They are encrypted at rest, decrypted only after authorization and Sensitive Detail Gate for approval views or full-fidelity security review, and excluded from plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, and error messages.
- Low-privilege audit exports and low-privilege operation output represent Approval Rejection Notes with immutable IDs, hashes, lengths, or presence flags rather than plaintext.
- Approval Rejection Notes must not be used to choose Draft Versions, choose delivery targets, suppress warnings, satisfy approval requirements, or drive policy decisions.
- Approval Request Cancellation closes a pending request without Promotion, Secret Delivery, Secret Sync, or protected delivery configuration changes.
- A requesting User may cancel their own pending Approval Request with a normal authenticated session; no High-Assurance Challenge is required.
- A requesting Machine Identity may cancel its own pending Approval Request with a currently valid machine credential whose Effective Access still covers the affected Project and Protected Environment; no High-Assurance Challenge is required.
- Machine Identity own-request cancellation does not require a recorded User instruction in V1. When the cancellation is caused by an Agent run, task, or User instruction, available correlation IDs are recorded in audit history but are not authorization source of truth.
- Machine Identity own-request cancellation is allowed after one or more human Partial Approvals exist, as long as the Approval Request is still pending and Promotion has not happened.
- A Machine Identity must not cancel Approval Requests created by Users or other Machine Identities.
- A User with sufficient owner/admin configuration Authorization Scopes for the affected Project and Protected Environment may cancel a pending Approval Request for cleanup.
- Approval scopes alone do not authorize Approval Request Cancellation. A User with approval scopes who is neither the requester nor a scoped owner/admin cleanup actor must use Approval Request Rejection to close the request as a review outcome.
- A Partial Approval is bound to exactly one Approval Request and one Promotion Change Set.
- Approval Request Cancellation may close a pending Approval Request after one or more Partial Approvals exist, as long as the Protected Approval Policy has not been satisfied and Promotion has not happened.
- Approval Request Cancellation invalidates Partial Approvals for delivery and future Approval Requests while preserving them in audit history.
- Approval Request Cancellation leaves Draft Versions in the Draft Area so the requester can create a later Promotion Change Set and Approval Request.
- A Protected Environment may have only one pending promotion Approval Request.
- If Promotion is requested again for the same Protected Environment, the service creates a new immutable Promotion Change Set and Approval Request, marks the prior pending promotion Approval Request as superseded regardless of requester, and leaves the superseded request in the audit trail.
- Approval Request Supersession must coalesce Approval Notifications so approvers are pointed to the latest pending request rather than spammed for every intermediate request; stale deep links for superseded requests must show stale/superseded state before optionally pointing an authorized User to the latest request.
- Promotion request and Approval Notification creation are rate-limited by actor, organization, and Protected Environment, with audit events for throttling and supersession.
- Environment-based delivery is Startup Configuration: values are expected to be read when an app process, job, deploy, or provider runtime starts. Rapidly changing values should use a future dynamic secret/configuration mechanism, not repeated Promotion requests.
- Superseded Approval Requests cannot be approved, rejected, or canceled, and any open approval view for a superseded request must show a stale/superseded state rather than performing Promotion, rejection, or cancellation.
- Policy-stale Approval Requests cannot be approved, rejected, or canceled, and any open approval view for a policy-stale request must show stale/policy-changed state rather than performing Promotion, rejection, or cancellation.
- Requester-access-stale Approval Requests cannot be approved, rejected, or canceled, and any open approval view for a requester-access-stale request must show stale/requester-access-changed state rather than performing Promotion, rejection, or cancellation.
- Draft-discard-closed Approval Requests cannot be approved, rejected, or canceled, and any open approval view for a draft-discard-closed request must show closed/draft-discarded state rather than performing Promotion, rejection, or cancellation.
- Approval confirmation warns, but does not block, when newer Draft Versions exist in the Draft Area outside the request's Promotion Change Set.
- The newer-draft warning should encourage the requester to request Promotion again when those Draft Versions should be included.
- A Promotion Change Set freezes Draft Version identity only; it does not freeze Secret Sync, Runtime Injection Policy, App Connection, or other delivery target configuration.
- Approval must use a metadata-only Approval Impact Review of current affected Secret Delivery and Secret Sync targets, recomputed immediately before approval.
- Approval Impact Review must exclude Sensitive Values and raw provider/request bodies.
- Approval Impact Review includes an Approval Impact Review Fingerprint derived from server-generated delivery and sync impact facts. The fingerprint must not be derived from Sensitive Values.
- If delivery or sync impact changed after the approver loaded the approval screen, the approval attempt must return stable code `approval.review_stale`, avoid Promotion, and require a fresh Approval Impact Review before High-Assurance Challenge.
- Stale Approval Impact Review does not cancel or supersede the Approval Request.
- Partial Approvals record the Approval Impact Review Fingerprint they approved.
- A Partial Approval counts toward Protected Approval Policy only while the current Approval Impact Review Fingerprint matches the fingerprint recorded on that Partial Approval.
- If Secret Delivery or Secret Sync impact changes after a Partial Approval and before Protected Approval Policy is satisfied, that Partial Approval becomes audit-only and fresh approval is required against the new Approval Impact Review.
- A Partial Approval counts toward Protected Approval Policy only if the approving User is still active, not suspended or offboarded, and currently has approval Authorization Scopes for the affected Project and Protected Environment when the approval threshold is evaluated.
- If the approving User loses approval access before Protected Approval Policy is satisfied, that Partial Approval becomes audit-only and fresh approval is required from a currently authorized User.
- If a Partial Approval becomes audit-only because the approving User failed access revalidation, later access restoration must not make that same Partial Approval count again.
- A User who regains approval access may approve the same pending Approval Request again only after current authorization, a fresh Approval Impact Review, and a new High-Assurance Challenge.
- When an approval satisfies Protected Approval Policy and causes Promotion, the service persists the accepted Approval Impact Review as an Approval Impact Snapshot.
- Approval Impact Snapshot is metadata-only, excludes Sensitive Values and raw provider/request bodies, and remains subject to Sensitive Detail Gate for decrypted Sensitive Metadata.
- Approval Impact Snapshot is the historical source of truth for the delivery and sync impact the final approver acted on.
- Rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed Approval Requests do not require an Approval Impact Snapshot in V1.
- Closed or stale views for rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed Approval Requests may show a clearly labeled Current Impact Preview for investigation.
- Current Impact Preview is recomputed current metadata, not historical approval evidence. It must not satisfy approval requirements, create or reuse Partial Approvals, perform Promotion, change Secret Delivery, change Secret Sync, or change protected delivery configuration.
- Approval Requests have exactly one approval purpose in V1.
- A promotion Approval Request contains one Promotion Change Set and must not include Protected Delivery Configuration Changes.
- Protected Delivery Configuration Changes require separate approval or a separate High-Assurance Challenge from secret Promotion.
- Protected Delivery Configuration Changes include protected Secret Sync create/enable/binding changes, protected Runtime Injection Policy changes, protected App Connection changes, Connection Boundary changes, protected Shared Secret Source attachment, and repository-scoped provider sync overrides.
- Approving Promotion must not create, enable, or change Secret Sync destinations, Runtime Injection Policies, App Connections, Connection Boundaries, or other delivery targets.
- Protected Environment Secret Delivery uses only Published Versions.
- Promotion is an audited lifecycle event that makes every Draft Version in the Promotion Change Set eligible for Runtime Injection and Secret Sync after the Protected Approval Policy is satisfied.
- Emergency rollback creates and promotes a new version from a retained encrypted prior Published Version without revealing plaintext to the caller.
- Rollback eligibility is controlled by a configurable Rollback Retention Window; expired versions are no longer delivery- or rollback-eligible.
- Optional expiration metadata for secrets that should not live forever.
- Secret rotation reminders and, later, provider-assisted rotation workflows.
- Secret Import paths and Secret Delivery paths that are tenant-bounded and audited.
- Sensitive Values must enter through safe sensitive input paths such as request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows.
- Sensitive Values must never be accepted in URLs, query strings, route params, CLI arguments, shell-visible flags, or GET requests.
- No Sensitive Values in Neon Postgres, logs, error messages, cache, analytics, or durable job payloads.
- No Sensitive Values in R2 backups, Queue messages, Durable Object state, KV, analytics events, traces, audit metadata, request logs, response logs, local config, or generated operation records.
- No raw request bodies, provider response bodies, command environments, decrypted secret maps, or other Sensitive Value containers in logs.
- No runtime-injected command stdout/stderr capture or storage.
- Sensitive Values may exist only inside approved delivery execution paths, such as encryption/decryption, runtime injection, provider sync, and rotation.
- Sensitive Values in approved execution paths are transient process memory only and must be excluded from structured output, errors, audit metadata, and durable retry payloads.
- Provider secret stores and child process environments are delivery destinations, not the Secret Source of Truth.
- Provider Readback is not supported in V1. Secret Sync verification checks provider metadata, key presence, update status, protection status, and API responses only, even if a provider API can return stored values.
- Secret Import is separate from Secret Sync reconciliation and must use Safe Sensitive Input Paths, high-risk controls where appropriate, and audit events.
- Secret Import must not read Sensitive Values from provider secret stores in V1.
- Explicit Provider Lookup is not exposed as a standalone UI, API, or CLI probe in V1.
- The primary V1 use for Explicit Provider Lookup is Secret Sync setup, planning, and approval: checking whether one exact Secret Sync Binding destination already exists so the user sees a Provider Overwrite Warning before approving or running sync.
- Each Explicit Provider Lookup checks one exact configured provider-side name, target, or binding inside one App Connection and Connection Boundary.
- Explicit Provider Lookup must not list provider inventory, enumerate provider-side secret or variable names, return unrelated provider objects, or expose raw provider response bodies.
- Explicit Provider Lookup returns only minimal existence/status metadata, normalized Provider Lookup Status, provider object IDs where needed, safe hashes where needed, and no Sensitive Values.
- Explicit Provider Lookup failures use stable safe codes such as `provider.lookup_not_found`, `provider.permission_denied`, `provider.boundary_mismatch`, and `provider.unavailable`.
- Explicit Provider Lookup must not return, log, audit, persist, or place in operation records provider-native error text, raw provider bodies, raw provider headers, stack traces, unrelated provider object names, or Sensitive Values.
- Explicit Provider Lookup is audited with actor, organization, project/environment when applicable, app connection, exact target/name/binding, provider response class, request ID, and operation ID.
- Explicit Provider Lookup treats provider-side secret and variable names, provider target names, and provider existence status as Sensitive Metadata.
- Explicit Provider Lookup output may decrypt provider-side names only after authorization and Sensitive Detail Gate for a scope-bounded setup, plan, approval, or detail response. Low-privilege output uses opaque IDs, hashes, and safe status codes.
- Explicit Provider Lookup must not copy provider-side names into plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, or error messages.
- Explicit Provider Lookup does not create Secret Shapes, Secret Versions, Secret Syncs, Secret Sync Bindings, or placeholder records.
- Explicit Provider Lookup does not perform Provider Sync Overwrite.
- Protected Environment Secret Sync setup, approval, enablement, and manual run require completed Explicit Provider Lookup status for every exact Secret Sync Binding destination.
- If Explicit Provider Lookup cannot determine the safe status for any exact Protected Environment binding, setup, approval, enablement, and manual run fail closed with stable code `provider.unavailable`.
- For non-protected Environments, if Explicit Provider Lookup cannot determine the safe status for an exact binding, setup, enablement, and manual run may proceed only with user-visible warning code `sync.overwrite_status_unknown`, explicit operation-scoped confirmation, and an audit event.
- The warning output must state that provider overwrite status is unknown and that the sync may replace a provider-side value without Provider Readback; it must not include provider-native error text, raw provider bodies, provider inventory, unrelated provider object names, or Sensitive Values.
- UI requires a clear confirm action. CLI and automation require a scoped flag such as `--allow-unknown-provider-overwrite`; generic `--yes`, stored defaults, prior confirmations, and unrelated approvals do not satisfy it.
- Enabling or running a Secret Sync requires every binding to have an insecur-managed value: Current Version for non-protected Environments and Published Version for Protected Environments.
- Enabling or running a Secret Sync fails with stable code `sync.source_value_missing` when a binding has no eligible version.
- Orphaned Managed Provider Copy records are cleanup metadata, not import sources.
- Secret Reveal to a caller is not supported for Protected Environment secrets, including for organization owners or actors with Service Access.
- Protected Environment Secret Reveal must not exist as a UI action, API route, CLI command, export job, debug endpoint, feature flag, or Service Access action.
- Protected Environment Secret Reveal denial must happen before value decrypt.
- Production environments are Protected Environments by default.
- Setting a Protected Environment secret does not immediately affect provider sync or runtime injection; explicit Promotion is required.
- After approval, Promotion selects the Published Versions for the Promotion Change Set; configured Runtime Injection uses them on the next grant, and every enabled Secret Sync affected by any promoted version enqueues immediately.
- Approval confirmation may show Display Names after authorization. It may show decrypted Sensitive Metadata such as provider-side target names, Approval Context Notes, and security-relevant relationships only after Sensitive Detail Gate and before approval submission; the confirmation and resulting operation output contain metadata only and no Sensitive Values.
- Approval submission must revalidate the Approval Impact Review against current delivery and sync configuration before performing Promotion.
- Scheduled promotion or scheduled sync is deferred; v1 approval uses Immediate Sync After Promotion for enabled syncs.
- Old values kept for rollback are retained as encrypted Secret Versions only, never as plaintext backup copies.
- Agents may receive Secret Use through Runtime Injection or Secret Sync, but must not receive Secret Reveal for Protected Environment secrets.
- Non-protected environments may copy Secret Shapes from Protected Environments, but must never copy protected secret values.
- Environment Defaults are values set specifically for non-protected environments and may be delivered locally according to that environment's policy.
- Shared values across environments must be modeled as explicit Shared Secret Sources with named environment attachments, not environment inheritance or value copying.
- A Shared Secret Source attached to a Protected Environment uses the strictest egress policy from its attached Environments.
- Protected Environment runtime injection requires a server-owned Runtime Injection Policy.
- Local project config may reference a Runtime Injection Policy by opaque Runtime Policy Key, but must never be trusted as the authorization rule.
- Runtime Injection Policies require Command Fingerprints for Protected Environment delivery when practical and issue only fresh, short-lived, one-use Injection Grants.
- Injection Grants are non-reusable. Every Runtime Injection execution requires a new server-issued grant even within an authenticated CLI session.
- Runtime Injection Policies use exact secret bindings only; wildcard, prefix, suffix, regex, tag, folder, or pattern-based secret selection is not supported.
- A Runtime Policy Key resolves to one Runtime Injection Policy and that policy resolves to a specific secret set.
- Runtime Injection Policy changes create immutable Runtime Injection Policy Versions. Used versions cannot be mutated because historical grants must remain reconstructable.
- Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata. This retention is separate from encrypted secret value rollback retention.
- Runtime Injection Policy Versions store immutable secret IDs and historical Display Names for exact bindings as ordinary metadata. Additional provider-side names, policy binding names, and security-relevant relationships remain Sensitive Metadata and require authorization plus Sensitive Detail Gate before User-facing reads or full-fidelity exports.
- Runtime Injection Policy Version Sensitive Metadata is encrypted at rest under tenant-bound data keys. Opaque IDs remain available for lookup and audit joins.
- Every Injection Grant references the exact Runtime Injection Policy Version used to authorize it.
- Exact bindings are required for forensic traceability during incident review.
- Command Fingerprints may cover selected scripts, package manifests, lockfiles, compiled artifacts, or an explicit command bundle.
- Runtime Injection crosses the Runtime Trust Boundary when the child process starts; the product cannot prevent an approved child process from reading or leaking its delivered environment.
- V1 supports two production delivery paths: Secret Sync to provider secret stores and dynamic Runtime Injection into approved commands.
- Dynamic Runtime Injection is the higher-security path for high-sensitivity secrets when the workflow can support it because it avoids a persistent provider-side copy and keeps authorization, revocation, and audit in insecur.
- Secret Sync is the compatibility and native-platform path; it intentionally creates a persistent copy in the provider's secret store until rotation, overwrite, or deletion.
- Secret Sync uses explicit Secret Sync Bindings: each binding maps one Secret in the source Environment to one provider-side secret or variable name.
- Secret Sync must not support all-secrets, tag, prefix, suffix, regex, folder, or pattern-based selection.
- Adding a Secret to an Environment does not add it to an existing Secret Sync.
- Changing Secret Sync Bindings for a Protected Environment is a Protected Delivery Configuration Change.
- Sync planning may use cached provider metadata, but plan-time metadata never authorizes Sensitive Value decrypt or provider writes.
- Every Secret Sync run must perform Sync Execution Revalidation immediately before decrypting Sensitive Values or writing provider-side values.
- Sync Execution Revalidation checks Provider Account Linkage, provider credential scope, Connection Boundary, Sync Target identity, provider-side resource identity, exact Secret Sync Bindings, required provider protection state, and eligible source version.
- Sync Execution Revalidation fails closed on Provider Drift with stable code `sync.provider_drift`.
- `sync.provider_drift` must block Sensitive Value decrypt, provider writes, queue retry loops that would keep decrypting, and partial writes for that sync run.
- Resolving Provider Drift requires provider reauthorization or a configuration change. For Protected Environments, any target or boundary change is a Protected Delivery Configuration Change.
- Sync Execution Revalidation audit events record safe provider metadata, expected/current identity hashes or IDs where allowed, result, and denial reason, but never Sensitive Values or raw provider bodies.
- A Secret Sync Binding is authoritative for its provider-side destination.
- Secret Sync writes use Provider Sync Overwrite: they replace the provider-side value for each bound destination without reading, comparing, preserving, or displaying the previous provider-side Sensitive Value.
- Existing provider-side values for bound destinations are overwritten when the user explicitly approves or runs the sync path for those exact bindings.
- Secret Sync setup, plan, and approval output uses Explicit Provider Lookup to produce Provider Overwrite Warnings for exact bound destinations that already exist in the provider.
- Provider Overwrite Warnings never include existing provider-side Sensitive Values, provider-native error text, raw provider bodies, unrelated provider object names, or provider inventory.
- Removing a Secret Sync Binding creates a Managed Provider Delete for the provider-side secret or variable previously managed by that binding.
- Managed Provider Delete uses tracked provider metadata or managed-key identity, not Sensitive Values.
- Secret Sync Disable is the non-destructive pause action: it stops future sync writes, does not delete provider-side managed copies, and status/plan output must warn when provider-side copies still exist.
- Secret Sync Deletion is destructive: it removes all Secret Sync Bindings, creates Managed Provider Deletes for every provider-side managed copy, and tombstones the Secret Sync for audit instead of erasing its history.
- Secret Sync Deletion must show every planned Managed Provider Delete and require explicit destructive confirmation before execution.
- Secret Sync Deletion may tombstone the Secret Sync even when some Managed Provider Deletes fail, because deletion is the user's explicit cleanup/start-over action.
- Failed Managed Provider Deletes create Orphaned Managed Provider Copy records with provider target metadata, failure reason, retry state, and audit links, but no Sensitive Values.
- Orphaned Managed Provider Copy means the provider cleanup state is unknown; the provider-side copy may or may not still exist.
- Orphaned Managed Provider Copy records must trigger user-visible warnings or notifications and remain visible in tombstone/status/audit output until cleaned up or explicitly acknowledged.
- Orphaned Managed Provider Copy warnings use stable warning code `sync.provider_delete_incomplete`.
- Orphaned Managed Provider Copy warnings are not critical platform failures; they represent provider-side cleanup work still needed.
- Orphaned Managed Provider Copy cleanup must be retryable after provider permission, connectivity, or reauthorization problems are fixed.
- Secret Sync Deletion for a Protected Environment is a Protected Delivery Configuration Change.
- Secret Sync is one-way delivery from insecur to the provider. Sync plan, run, status, and verification commands must not read Sensitive Values back from providers.

Agent/DX requirements:

- `insecur secrets set` and `insecur secrets rollback` support `--comment`, `--json`, and stable exit codes.
- `insecur secrets set --generate` requests service-side generation and returns metadata only.
- `insecur secrets set --value-stdin` supports caller-supplied Blind Secret Writes but still returns metadata only.
- Non-protected `insecur secrets set --secret-name` may create a missing Secret Shape with a client-minted opaque Secret ID, but metadata output and audit records still use the opaque ID; ambiguity fails closed.
- Non-protected `insecur run --secret-name` and `insecur run --secret-id` may select exact Current Versions for one command. Protected Environments reject direct secret selection and require a Runtime Injection Policy.
- In Protected Environments, secret set/import commands return Draft Version IDs, not delivery.
- In non-protected Environments, secret set/import commands can make the new version current immediately by default.
- Promotion requests accept explicit Draft Version IDs, return Promotion Change Set and Approval Request IDs, and should notify authorized approvers through in-app notification, browser push, mobile push, email, or another configured channel.
- Approval output includes immediate sync operation IDs for enabled Secret Syncs affected by any promoted version in the Promotion Change Set.
- `insecur secrets promote` explicitly publishes a Protected Environment version for delivery.
- `insecur secrets rollback --promote` performs emergency rollback from a retained encrypted prior Published Version.
- Protected Environment Promotion, protected rollback, and Secret Import into a Protected Environment require a High-Assurance Challenge.
- Sensitive Values are accepted by stdin, masked prompt, request body, or provider flow only; no `--value <secret>`, `--token <secret>`, or `--client-secret <secret>` flags.
- `insecur run` delivers secrets only through runtime injection to a child process environment.
- `insecur run` for Protected Environment secrets requires a Runtime Injection Policy and one-use Injection Grant.
- CLI Profiles may select organization, project, environment, and default runtime policy, but must not contain Sensitive Values.
- `insecur run <profile-id> -- <command>` supports deploy and local command injection without local secret files.
- The v1 runtime wrapper may be the CLI process itself: fetch an Injection Grant, load approved Sensitive Values into process memory, fork/exec the approved child with environment variables, and avoid stdout, JSON, logs, and disk.
- A separate resident local helper is not required for v1 unless it provides a concrete boundary beyond direct in-memory CLI injection.
- GitHub Actions and other provider destinations may receive production secrets through audited Secret Syncs when native platform storage is the desired delivery boundary.
- Protected Environment Secret Sync create, enable, and manual run require a High-Assurance Challenge.
- Protected Environment Secret Sync creation and binding changes may show Display Names after authorization, but may show decrypted Sensitive Metadata for exact Secret Sync Bindings only after Sensitive Detail Gate and before approval submission.
- Protected Environment Secret Sync creation, enablement, and binding changes must show that existing provider-side values for those exact bindings will be overwritten without Provider Readback.
- Protected Environment Secret Sync binding removal may show the resulting Managed Provider Deletes only after Sensitive Detail Gate and before approval submission.
- Protected Environment Secret Sync Deletion must show all resulting Managed Provider Deletes before the protected delivery configuration approval path.
- Protected Environment Secret Syncs to GitHub Actions must target GitHub Environment secrets by default.
- Protected Environment GitHub Actions syncs require the GitHub Environment to already exist; insecur must not auto-create it during sync setup or execution.
- Protected Environment GitHub Actions syncs block unless the target GitHub Environment has visible protection rules.
- The exact GitHub Environment Protection rule matrix is deferred until the GitHub sync implementation pass.
- Repository-scoped GitHub Actions secrets are allowed only as an explicit high-risk override because they are broader inside the target repository.
- File delivery is denied for Protected Environment secrets. Non-protected file delivery, if supported for local development or legacy tooling, must require explicit opt-in, mode `0600`, overwrite protection, and repository safety checks.
- Agent-facing output reports delivery metadata only and must not contain Sensitive Values.
- Break-glass workflows for Protected Environment secrets may permit additional Secret Delivery, rotation, replacement, provider reauthorization, or rollback, but must not reveal Sensitive Values to a caller.
- Shared Secret Source create/update/attach/detach operations are audited and require a High-Assurance Challenge when any attached Environment is protected.
- Machine Identities may create Protected Environment Blind Secret Writes that produce Draft Versions, request Promotion, and cancel their own pending Approval Requests, but must not approve or reject Approval Requests, cancel Approval Requests created by other actors, complete Promotion, rollback, change retention, change Runtime Injection Policy, change Secret Sync, change App Connection, attach Shared Secret Sources, mutate Service Access, manage Signup Lockdown, or manage Tenant Suspension unless the exact bounded operation was pre-authorized by a User through a High-Assurance Challenge.
- Runtime Injection Policy create/update/disable, Runtime Injection Policy Version publish/disable, and Injection Grant issue/use/deny events are audited.
- Injection Grant issue/use/deny/reuse-deny audit events record actor, auth method, Runtime Policy Key, Runtime Injection Policy ID, Runtime Injection Policy Version ID/hash, exact secret binding IDs, delivered secret version IDs, Command Fingerprint, whether the fingerprint matched policy, request ID, result, and denial reason where applicable.
- Deploy key exchange audit events record the requested Runtime Policy Key, Runtime Injection Policy ID, Runtime Injection Policy Version ID/hash, deploy key ID, and whether that policy was attached to that deploy key.
- Runtime Injection completion audit events may record exit code, signal, start/end timestamps, and duration, but never stdout/stderr.
- Audit events never record Sensitive Values.

### 5. App Connection And Sync Plan

Provider access should be owned by app connections, not scattered credentials.

The concrete CLI and sync workflow is specified in [cli-and-sync.md](cli-and-sync.md).

Plan for:

- Organization-owned app connections.
- Provider-specific connection methods.
- GitHub App installation for GitHub Actions secrets.
- GitHub Actions sync targets include one repository plus, for protected production delivery, one GitHub Environment.
- Provider identity, Connection Boundary, target resource identity, and required target protection state are checked during create/enable and planning, then rechecked through Sync Execution Revalidation before each sync decrypts or writes values. GitHub Environment existence and visible protection status are part of this gate for protected GitHub Actions sync.
- Vercel Integration OAuth for Vercel environment variables.
- Scoped Cloudflare API tokens with the minimum permission needed to update direct Worker secrets for explicit Worker script targets until a suitable Cloudflare app/OAuth install flow exists for that API.
- No global provider API keys.
- Encrypted provider credentials with key version metadata.
- Provider credentials are organization-owned sensitive data and must be encrypted under organization data keys before production use.
- Production app connections and Secret Sync must fail closed when provider credential storage has not passed the Storage Security Gate.
- Provider credentials must enter through provider authorization flows, request bodies over TLS, CLI stdin, or masked prompts.
- Provider credentials must never be accepted in URLs, query strings, route params, CLI arguments, shell-visible flags, or GET requests.
- Provider OAuth or app-install callbacks must use one-time tenant-bound state, exact redirect URI matching, PKCE and nonce where supported, provider/issuer mix-up defenses, and replay protection.
- Callback state must bind the intended Organization, initiating User, pending App Connection or reauthorization operation, Connection Method, and intended Connection Boundary.
- The callback handler must re-check the initiating User's current Organization Access and required permission after the provider returns and before persisting credentials or changing Provider Account Linkage.
- The callback handler must verify provider account, installation, team, repository, project, worker, and resource ownership against the intended Connection Boundary before creating or updating an App Connection.
- A provider callback must fail closed if the returned provider identity does not match the pending operation, the initiating User lost access, the Organization is suspended, the app connection was canceled/superseded, or the state was already consumed.
- Callback audit events must record tenant, actor, operation, provider, safe provider account/installation identifiers, result, and denial reason without raw provider bodies, tokens, or Sensitive Values.
- Provider disconnect, credential rotation, and reauthorization workflows.
- App Connection create, reauthorization, credential replacement, and Connection Boundary changes require a High-Assurance Challenge.
- Manual scoped provider tokens require least-privilege setup guidance, provider-side revocation instructions, expiration/rotation tracking where possible, and audit events for creation, test, use, rotation, and deletion.
- Cloudflare app connections require an explicit connection boundary. Account-level Cloudflare tokens are allowed only when narrower provider permissions are unavailable, and secret syncs must pin allowed Workers and environments.
- Project-owned secret syncs that reference app connections.
- Sync dry-run, diff, queue-backed execution, retry, dead-letter handling, and audit events.
- Sync job idempotency to avoid partial duplicate writes.
- Durable Object serialization per organization/provider/target to prevent concurrent provider writes from racing.
- Sync audit trails that include enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release events.

Agent/DX requirements:

- `insecur connections list --json` never returns credentials.
- `insecur sync plan --json` shows target changes without exposing values.
- `insecur sync run --operation <id>` is resumable.
- Queue messages store operation IDs and target metadata, never Sensitive Values.
- Operation status should expose enough state for agents to distinguish queued, locked, running, retrying, waiting for reauthorization, dead-lettered, failed, completed_with_warnings, and completed states.
- Provider errors are normalized enough for agents to decide whether to retry, reauth, or stop.

### 6. Audit, Monitoring, And Detection Plan

Audit logs are part of the product, not a debug feature.

Plan for:

- Tenant-qualified audit rows with organization ID and optional project ID.
- Typed actor, auth method, event type, resource, IP, user agent, request ID, result, and metadata.
- Allowlisted audit metadata fields; never store Sensitive Values, decrypted request bodies, decrypted provider bodies, or child process environments.
- Denied authorization events, including denied cross-tenant attempts.
- Auth failure and refresh-token reuse events.
- Secret metadata read, write, promotion, rollback, retention policy, Secret Import, egress, runtime injection, and sync events.
- App connection create/update/delete/use/reauth events.
- Key rotation and restore events.
- Tamper-evident audit exports using tenant-bounded JSONL entries, a per-export hash chain, and an HMACed manifest.
- Audit export manifests that include organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC.
- Full-fidelity audit exports may include Sensitive Metadata such as Approval Context Notes, Approval Rejection Notes, provider target names, and policy binding names only after authorization and Sensitive Detail Gate for security review. Historical Display Names may appear as ordinary audit metadata.
- Low-privilege audit exports use immutable IDs, hashes, lengths, and presence flags and exclude Sensitive Metadata plaintext that reveals security-relevant structure.
- HMAC verification for export integrity and authenticity, with asymmetric signing deferred unless third-party verification becomes a product requirement.
- Basic anomaly detection later: unusual source IP, high-volume reads, repeated denied access, sync failures.

Agent/DX requirements:

- `insecur audit tail --json` for local diagnosis.
- `insecur audit export --org-id <id> --from <time> --to <time>` with tenant-bounded scope.
- `insecur audit verify <export>` for checking the hash chain and HMACed manifest.
- Stable event names that tests and agents can assert against.
- Canary leak tests that prove secret-shaped values do not appear in logs, audit metadata, errors, traces, analytics, or operation records.

### 7. Abuse Resistance And Runtime Hardening Plan

Secrets systems need boring defensive defaults.

Plan for:

- Rate limits by actor, organization, endpoint class, and IP.
- Separate limits for auth, secret reads, secret writes, syncs, and rotation jobs.
- Separate limits for promotion requests and Approval Notifications by actor, organization, and Protected Environment to prevent approval fatigue.
- Separate public onboarding limits for login, MFA enrollment, user creation, organization creation, invitations, and provider connection attempts.
- Service Access controls for signup lockdown, tenant suspension, and abusive organization containment.
- Tenant enumeration defenses across signup, invitation, login, organization creation, and membership flows.
- Signup lockdown checks are deny-by-default for public onboarding and fail closed when configuration cannot be loaded.
- Tenant Suspension blocks high-risk and cost-generating operations for the suspended Organization, including secret writes, Injection Grant issue, Secret Sync run, App Connection create/use, Invitation create/accept, Machine Identity create/token exchange, Approval Request approval/rejection/cancellation, and non-remediation exports.
- Tenant Suspension revokes active Injection Grants and disables queued or retrying Secret Sync operations for the suspended Organization.
- Tenant Suspension closes pending Approval Requests in the suspended Organization through Requester Access Staleness, without Promotion, Secret Delivery, Secret Sync, or protected delivery configuration changes.
- Tenant Suspension does not pause pending Approval Requests for automatic resumption after reinstatement; reinstated Organizations require fresh Approval Requests from currently authorized requesters.
- Suspended organization owners can log in with MFA to see suspension status, remediation instructions, and limited audit/security history.
- Tenant Suspension, reinstatement, and escalation to deletion require Service Access audit events and runbook verification.
- Service Access actions are deny-by-default and scoped to explicit service operations such as suspend, reinstate, inspect safe audit metadata, inspect operation state, manage signup lockdown, and view abuse/rate-limit signals.
- Mutating Service Access controls require a High-Assurance Challenge, reason codes, request IDs, audit events, and owner-visible audit entries where safe.
- Request size limits and strict JSON parsing.
- Input validation for opaque IDs, Display Names, provider IDs, and redirect targets.
- No broad plaintext search indexes over Sensitive Metadata in v1. List endpoints must be scope-bounded and authorization-checked before Display Names are returned, and must pass Sensitive Detail Gate before decrypted Sensitive Metadata is returned.
- Reject Sensitive Values in URLs, query strings, route params, GET requests, CLI argv, and other unsafe input paths.
- Security headers including CSP once a UI exists.
- No caching for `/v1/*` secret-bearing responses.
- Structured, non-sensitive error responses.
- Centralized structured logging with allowlisted fields and no request/response body logging for secret-bearing routes.
- Request IDs on every response.
- Idempotency keys for high-risk mutations.
- Safe default CORS policy.

Agent/DX requirements:

- Rate-limit responses include machine-readable retry metadata.
- Signup lockdown returns stable machine-readable errors without revealing whether a target organization or user exists.
- Idempotency lets agents safely retry after network failures.
- Validation errors identify the bad field without echoing Sensitive Values.
- Provider error normalization stores provider codes and safe summaries only, never raw provider payloads that may contain submitted Sensitive Values.
- Automated tests cover safe sensitive input path enforcement for API routes and CLI commands.

### 8. Backup, Restore, And Deletion Plan

Backup and restore are security features for availability and recovery.

Plan for:

- Encrypted R2 backups for Postgres snapshots or exports.
- Separate backup key material from runtime key material where practical.
- Restore tests before v1 production use.
- Tenant-scoped export and deletion workflows.
- Recovery drills for root key loss, data key corruption, provider credential compromise, and accidental secret deletion.
- Documented limits: if root key material is lost, encrypted data is unrecoverable.

Agent/DX requirements:

- `insecur backup create --json`, `insecur restore plan --json`, and `insecur restore verify --json`.
- Restore plans show impacted organizations/projects before execution.
- Destructive operations require explicit confirmation flags in non-interactive mode.

### 9. Secure SDLC And Supply Chain Plan

The repository should make security regressions hard to merge.

Plan for:

- Security checklist mapped to OWASP ASVS Level 2 where applicable.
- API checks mapped to OWASP API Security Top 10.
- Dependency vulnerability scanning.
- Secret scanning in git history and CI.
- Lockfile integrity checks.
- Least-privilege GitHub Actions permissions.
- Branch protection and required checks before production deploy.
- Dependency update cadence.
- Minimal Cloudflare Secrets Store entries, Hyperdrive bindings, and documented secret inventory.
- Reproducible build/deploy notes for Cloudflare Workers.
- Security review for new auth methods, app connections, sync destinations, and encryption changes.

Agent/DX requirements:

- A single `pnpm security:check` script should eventually run the local security gate.
- Security findings should have stable categories so agents can triage and file issues.
- Docs should include copy-pasteable commands that are safe by default.

## Security Runbooks To Write

The canonical runbook template and grouped catalog live in [security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md). This list remains the required V1 runbook inventory.

Write these before relying on insecur for valuable production secrets:

- First tenant bootstrap.
- Public onboarding abuse response.
- Signup lockdown enable, verify, and disable.
- Tenant suspension and reinstatement.
- Service Access review.
- User invitation and offboarding.
- Lost or compromised human session.
- Machine identity credential compromise.
- App connection compromise or provider disconnect.
- Secret value rotation.
- Root key rotation.
- Organization data key rotation.
- Project data key rotation.
- Failed or interrupted rotation job.
- Neon Postgres restore from encrypted backup.
- Tenant export and deletion.
- Tamper-evident audit export and verification.
- Suspicious audit activity investigation.
- Emergency break-glass recovery without Protected Environment Secret Reveal.
- Protected Environment secret replacement without reveal.
- Protected Environment emergency rollback from retained encrypted version.

Each runbook should include:

- When to use it.
- Preconditions and required role.
- CLI dry-run command.
- Execution command.
- Verification command.
- Audit events expected.
- Rollback or recovery notes.

## Security Release Gates

The canonical release gate Interface, evidence bundle, gate profiles, and automation contract live in [security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md). This checklist remains the detailed V1 gate evidence.

Before v1 production use, require:

- Threat model reviewed against this document.
- First Value Milestone reviewed as non-protected only, provider-free, and not safe for production-grade Sensitive Values.
- Small-Group Production readiness reviewed, including controlled Organization creation, Guided Organization Provisioning controls, Invitation-based Organization Access, membership boundaries, tenant-qualified authorization, and tenant-bounded audit.
- Delivery Risk Policy Presets reviewed to prove secure defaults, explicit non-protected preview/development relaxations, auditable preset/version changes, and no terminal-only Protected Environment approval path.
- Public multi-tenant readiness reviewed before broad public signup is enabled, including hostile tenant signup, quotas, abuse handling, tenant enumeration, and Service Access.
- No supported unsafe scaffold mode remains in API, CLI, setup docs, or deployment guidance.
- Service Access verified to support incident investigation with decrypted Sensitive Metadata after Sensitive Detail Gate but without Secret Reveal or Sensitive Values.
- Cross-tenant authorization tests for all tenant-owned resources.
- [Storage Security Gate](storage-security-gate.md) passed: root key material outside the Postgres metadata store, tenant data keys, key versions, Tenant-Scoped Store/RLS, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and no-plaintext persistence are verified together.
- Production Secret Delivery and Secret Sync fail closed when the Storage Security Gate has not passed.
- Misuse-Resistant Defaults reviewed across CLI, API, and UI surfaces so ordinary management paths cannot accidentally reveal Sensitive Values.
- First Value Proof tests verify provider-free setup, non-protected development Environment only, normal `secrets set --generate` and `run --secret-name` commands, service-generated Blind Secret Write, Runtime Injection into the copyable verifier in `examples/first-value-proof/verify.mjs`, metadata-only output, no Sensitive Values, no raw digests, no child-process environment capture, no local plaintext files, no onboarding-only proof command, and no claim that arbitrary child processes cannot read injected development values.
- Protected Environment Blind Secret Write, Promotion request, Approval Request, Draft Version non-delivery, rollback, and Rollback Retention Window behavior tested.
- Protected Change Orchestration tests from [protected-change-orchestration.md](protected-change-orchestration.md) pass for Staged Change Set, Publish, Approval Request lifecycle, stale closures, Partial Approval, final apply, and metadata-only output.
- Promotion Change Set tests prove exact Draft Version IDs, one Protected Environment, immutable approval payload, no wildcard/all-staged selection, and all-or-nothing Promotion.
- Draft Version Reuse tests prove closed Approval Requests may contribute only still-existing, non-discarded Draft Versions to a fresh Promotion Change Set while the target still accepts protected Promotion, and cannot reuse the prior Approval Request, Partial Approvals, Approval Impact Review, Approval Impact Review Fingerprint, Approval Impact Snapshot, or approval screen state.
- Draft Version Discard tests prove requester-own-draft discard, scoped owner/admin cleanup discard, cross-project denial, no Sensitive Value reveal, human UI/CLI destructive confirmation requirement, confirmation metadata-only impact with exact Draft Version IDs, affected Approval Request IDs, Partial Approval audit-only warning, and crypto-erasure warning, confirmation exclusion of Sensitive Values/decrypted Sensitive Metadata/Approval Context Notes/Approval Rejection Notes, confirmation binding to exact computed impact, execution-time revalidation of impact and actor Effective Access, stale confirmation denial when a draft was promoted/already discarded/removed from scope or affected Approval Request set changed, no Approval Request or High-Assurance Challenge requirement, API/Machine Identity exact Draft Version ID requirement, wildcard/all-drafts denial, idempotent repeated discard for exact IDs, immediate encrypted value material crypto-erasure, tombstone/audit metadata retention, no product/admin/support/restore recovery path for the discarded Sensitive Value, audit records, affected pending Approval Request closure without Promotion, Partial Approvals becoming audit-only, terminal non-restore behavior, discarded Draft Version exclusion from later Draft Version Reuse, and requiring a new Blind Secret Write/new Draft Version if the same value is still wanted.
- Pending Approval Request tests prove no age-based expiration, no automatic inclusion of Draft Versions created after the request, and closure only through approval, rejection, cancellation, supersession, Approval Policy Staleness, Requester Access Staleness, target lifecycle changes that stop protected Promotion, or Draft Version Discard affecting the Promotion Change Set.
- Approval Request Supersession tests prove a repeat Promotion request for the same Protected Environment supersedes the prior pending request regardless of requester, creates new immutable IDs, blocks approval of stale views, coalesces notifications around the latest request, stale deep links show superseded state, and leaves an audit trail.
- Newer-draft warning tests prove approval warns but does not block when the Draft Area contains Draft Versions outside the Promotion Change Set.
- Approval Impact Review tests prove delivery/sync targets are recomputed before approval, Sensitive Values are excluded, decrypted Sensitive Metadata is hidden until Sensitive Detail Gate, stale approval screens cannot promote, the underlying Approval Request remains pending, Partial Approvals record an Approval Impact Review Fingerprint, impact changes before threshold make prior Partial Approvals audit-only and require fresh approvals, accepted final approval persists an Approval Impact Snapshot, the snapshot is used as historical approval evidence, and rejected/canceled/superseded/policy-stale/requester-access-stale/draft-discard-closed current impact previews are clearly labeled non-authoritative.
- Approver Access Revalidation tests prove Partial Approvals count only when the approving User remains active, not suspended/offboarded, and currently authorized for the affected Project and Protected Environment; lost access before threshold makes the Partial Approval audit-only, later access restoration does not make that old Partial Approval count again, and the User must approve again with current authorization, fresh Approval Impact Review, and new High-Assurance Challenge.
- Requester Access Staleness tests prove pending Approval Requests close without Promotion when the requesting User loses Organization Access, is suspended, or is offboarded, when the Organization enters Tenant Suspension, or when the requesting Machine Identity has durable authority removed through disablement, relevant Membership or Authorization Scope removal, Tenant Suspension, revocation/disablement of the Auth Method used for the request, or compromise-response rotation that marks that Auth Method untrusted; short-lived machine credential expiry and normal Environment Deploy Key rotation alone do not stale the request; requester-access-stale requests preserve Partial Approvals as audit-only, leave Draft Versions in the Draft Area, block approval/rejection/cancellation, remain terminal even if requester access is restored or the Organization is reinstated, and require a fresh Approval Request from a currently authorized requester.
- Approval target lifecycle tests prove Project or Protected Environment archive/delete, or any target state that no longer accepts protected Promotion, closes pending Approval Requests without Promotion, preserves audit history, makes Partial Approvals audit-only, and remains terminal if the target is restored or recreated.
- Approval Notification tests prove out-of-band notifications contain no Approval Context Note plaintext, Sensitive Values, Display Names such as organization/project/environment/secret names, decrypted Sensitive Metadata such as provider target names, raw bodies, approval impact details, bearer approval tokens, or approval/rejection/cancellation actions; browser/mobile push payloads are lock-screen safe and browser/mobile push deep-links require authenticated approval view authorization plus Sensitive Detail Gate before sensitive details; stale deep links for approved, rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed Approval Requests show closed/stale state with no delivery-changing actions; optional closure notifications remain metadata-safe and action-free; email remains alert-only.
- Closed Approval View tests prove currently authorized Users can inspect immutable request facts for approved, rejected, canceled, superseded, policy-stale, requester-access-stale, and draft-discard-closed Approval Requests, Approval Context Notes and Approval Rejection Notes remain hidden until Sensitive Detail Gate, and inspection cannot approve, reject, cancel, promote, reuse Partial Approvals, or change delivery.
- Push Device Registration tests prove new registrations and replacements require a High-Assurance Challenge, registrations are user/device scoped Sensitive Metadata, encrypted or otherwise protected at rest, audited on create/update/delete, revocable by the user, invalidated on logout-all/MFA reset/suspicious activity/lost-device/offboarding, and never accepted as approval authority or a High-Assurance Challenge.
- Approval fatigue tests prove promotion request and notification rate limits by actor, organization, and Protected Environment, plus supersession notification coalescing for repeated requests.
- Approval Context Note tests prove agent/user notes are Sensitive Metadata, encrypted at rest, hidden until Sensitive Detail Gate, length-limited, escaped, visually separated from server-generated facts, excluded from plaintext indexes/logs/analytics/low-privilege exports, unable to suppress warnings or alter the approved change set, and never treated as approval source of truth.
- Approval Rejection Note tests prove rejection notes are optional in V1, Sensitive Metadata, encrypted at rest, hidden until Sensitive Detail Gate, length-limited, escaped, visually separated from server-generated rejection facts, excluded from plaintext indexes/logs/analytics/low-privilege exports, unable to suppress warnings or alter the rejected change set, and never required by default Protected Approval Policy.
- Approval purpose separation tests prove Promotion approval cannot create, enable, or change protected delivery configuration and protected delivery configuration approval cannot promote Draft Versions.
- Immediate Sync After Promotion tests prove approval enqueues every enabled Secret Sync affected by any promoted version in the Promotion Change Set and never enqueues disabled syncs.
- Secret Sync Binding tests prove syncs use exact Secret IDs, reject all-secrets/tag/prefix/pattern selection, and do not include newly created environment Secrets until explicitly bound.
- Sync Execution Revalidation tests prove every sync run rechecks Provider Account Linkage, credential scope, Connection Boundary, target identity, provider protection state, exact bindings, and source version eligibility immediately before decrypt/write; Provider Drift returns `sync.provider_drift` before Sensitive Value decrypt and requires reauthorization or approved configuration change.
- Provider Sync Overwrite tests prove bound provider-side values are overwritten only after setup/plan/approval has produced Provider Overwrite Warnings for exact existing destinations, and without Provider Readback, value comparison, value preservation, or Sensitive Values in output.
- Managed Provider Delete tests prove removing a Secret Sync Binding deletes the provider-side copy previously managed by that binding without decrypting Sensitive Values, while disabling a Secret Sync leaves provider-side copies in place with warnings.
- Secret Sync Deletion tests prove deleting a sync removes all bindings, creates Managed Provider Deletes for all managed provider-side copies, requires destructive confirmation, tombstones audit history, and enforces protected delivery configuration approval for Protected Environments.
- Secret Sync Deletion partial-cleanup tests prove failed Managed Provider Deletes create Orphaned Managed Provider Copy warnings, tombstone the sync, notify the User, preserve retry cleanup metadata, and complete with warnings rather than critical failure.
- Explicit Provider Lookup tests prove each lookup is exact, scoped to one App Connection and Connection Boundary, rate-limited, audited with exact target/name/binding and response class, normalized into safe Provider Lookup Status codes, unavailable as a standalone UI/API/CLI probe, unable to enumerate provider-side names through wildcard, prefix, empty, pattern, or list requests, and unable to create Secret Shapes, Secret Versions, Secret Syncs, Secret Sync Bindings, or placeholder records.
- Provider Overwrite Warning tests prove Secret Sync setup, plan, and approval output warn when an exact bound provider destination already exists, without reading/comparing/preserving/displaying the existing provider-side Sensitive Value or exposing provider inventory, unrelated names, provider-native error text, or raw provider bodies.
- Provider Lookup Status tests prove failures return only stable safe codes such as `provider.lookup_not_found`, `provider.permission_denied`, `provider.boundary_mismatch`, and `provider.unavailable`, with provider-native error text, raw provider bodies, raw provider headers, stack traces, unrelated provider object names, and Sensitive Values excluded from UI, CLI, API responses, logs, audit events, analytics, queue payloads, and operation records.
- Protected Explicit Provider Lookup tests prove Protected Environment Secret Sync setup, approval, enablement, and manual run fail closed with `provider.unavailable` when any exact binding destination lacks a completed lookup status.
- Non-protected unknown-overwrite tests prove non-protected Secret Sync setup, enablement, and manual run may proceed after unavailable lookup status only when `sync.overwrite_status_unknown` is surfaced, operation-scoped confirmation is provided, generic `--yes` alone is rejected, the unknown overwrite risk is audited, and provider-native error text, raw provider bodies, provider inventory, unrelated provider object names, and Sensitive Values are excluded from all output and records.
- Secret Sync source value tests prove enable/run fails with `sync.source_value_missing` unless every binding has a Current Version for non-protected Environments or Published Version for Protected Environments.
- Secret Import tests prove provider-side Sensitive Values are never read back in V1 and imported values enter only through Safe Sensitive Input Paths.
- Secret Sync Disable tests prove disabling stops future writes without deleting provider-side copies and shows warnings for remaining managed copies.
- Protected Approval Policy tests cover one-approver solo-owner mode through owner approval scopes, one-approval requester self-approval with approval scopes and High-Assurance Challenge, explicit approval-scope authorization for non-owners, organization-scoped approval, project-scoped approval, cross-project approval denial, admin/developer-without-approval-scope denial, optional two-person approval with distinct User counting, duplicate approval non-counting, overlapping Membership/Team grants counting one User only, requester self-approval denial when multiple approvals are required, policy change requiring owner/admin configuration scopes plus High-Assurance Challenge, approval-scope-only policy change denial, policy change audit contents, policy change making pending requests policy-stale, policy-stale requests blocking approval/rejection/cancellation, policy-stale Partial Approvals becoming audit-only, requester access loss or Tenant Suspension making pending requests requester-access-stale, requester-access-stale requests blocking approval/rejection/cancellation, requester-access-stale Partial Approvals becoming audit-only, reinstatement not restoring requester-access-stale requests, Approval Request Rejection closing without Promotion while leaving Draft Versions available, optional Approval Rejection Note handling, approval-only cancellation denial, User requester Approval Request Cancellation without High-Assurance Challenge, Machine Identity own-request cancellation with valid credential and matching Effective Access, Machine Identity own-request cancellation without recorded User instruction, Machine Identity own-request cancellation after human Partial Approval, Machine Identity cancellation audit correlation when user/task/run context is available, Machine Identity cross-request cancellation denial, scoped owner/admin cleanup cancellation, cancellation after Partial Approval, Partial Approval non-reuse after cancellation/rejection/supersession/policy-staleness/requester-access-staleness, Machine Identity approval/rejection denial, and Service Access approval/rejection denial.
- Protected Environment Secret Reveal prohibition tests prove UI, API, CLI, export, debug, and Service Access paths deny before value decrypt.
- Provider Readback prohibition tests prove Secret Sync verification does not request, receive, log, persist, or return provider-side Sensitive Values.
- No Plaintext Persistence and Secret-Free Logging tests pass with canary Sensitive Values across API, CLI, sync, runtime injection, errors, audit events, operation records, and worker logs.
- Display Name tests prove user-authored product names are ordinary metadata, visible after authorization without Sensitive Detail Gate, and excluded from out-of-band Approval Notifications.
- Sensitive Metadata Encryption tests prove Approval Context Notes, Approval Rejection Notes, Push Device Registrations, provider-side binding/lookup names, provider target names, policy binding names, and security-relevant relationships are encrypted at rest, absent from plaintext indexes, and only decrypted for authorized Scoped Lists, detail responses, or full-fidelity exports after Sensitive Detail Gate.
- Safe Sensitive Input Path tests prove Sensitive Values are rejected from URLs, query strings, route params, CLI arguments, and GET requests.
- Auth/session behavior reviewed against RFC 9700 and OWASP auth/session guidance.
- MFA, High-Assurance Challenge, and Sensitive Detail Gate behavior tested for organization owners, administrators, Service Access users, normal-session hijack resistance, and machine-identity denial paths.
- Security checks mapped to OWASP ASVS Level 2 where applicable.
- API checks mapped to OWASP API Security Top 10.
- Key rotation plan and at least one successful restore drill.
- App connection revocation/reauthorization tested for every supported provider.
- Provider authorization callback tests prove one-time tenant-bound state, replay denial, provider/issuer mix-up denial, post-callback membership re-checks, provider account/installation ownership verification, canceled/superseded operation denial, Tenant Suspension denial, and no cross-tenant App Connection linkage.
- Audit export verified for tenant boundaries, hash-chain integrity, HMAC manifest validation, and low-privilege Sensitive Metadata exclusion.
- CLI agent flows tested in non-interactive mode.
- Dependency and secret scanning enabled in CI.

## References

- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.ietf.org/rfc/rfc9700.html)
- [OWASP Application Security Verification Standard](https://github.com/OWASP/ASVS)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [NIST SP 800-57 Part 1](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)
- [NIST SP 800-218 Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
