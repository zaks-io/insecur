# insecur Context

insecur is a secrets-management product for organizing, protecting, versioning, and syncing secrets across many projects and teams.

## Language

**Actor**:
A user or machine identity that can authenticate and attempt actions.
_Avoid_: account, principal

**Instance**:
The deployment boundary for one insecur installation, including global configuration, onboarding posture, and optional Service Access operators.
_Avoid_: deployment, environment when the whole product install is meant

**Hosted Instance**:
An Instance operated by insecur as a service, such as insecur.cloud.
_Avoid_: SaaS when the deployment boundary is meant

**Self-Hosted Instance**:
An Instance deployed into customer-controlled Cloudflare infrastructure using the same insecur runtime as a **Hosted Instance**.
_Avoid_: on-prem, separate product, rewrite when the deployment boundary is meant

**Small-Group Production**:
The near-term product posture for personal projects and relatively small trusted groups using insecur with production-quality secret protection.
_Avoid_: public multi-tenant production when broad public onboarding is not meant, dev-only mode

**Enterprise-Ready Model**:
A product model that preserves organization, membership, role, authorization, audit, and key boundaries so later enterprise support does not require a domain refactor.
_Avoid_: enterprise edition, custom policy engine when the model boundary is meant

**Bounded Onboarding**:
An onboarding posture where Instance Operators create Organizations and Users receive Organization Access through Invitations instead of public self-service organization creation.
_Avoid_: public onboarding when self-service organization creation is not meant

**Instance Configuration**:
The non-secret settings that control an Instance, such as onboarding posture, identity settings, rate limits, feature availability, and instance-scoped webhook subscriptions.
_Avoid_: instance settings when the configured object is meant

**Instance Identity Configuration**:
The part of **Instance Configuration** that defines how **Users** authenticate to an Instance through a **Human Identity Provider**.
_Avoid_: organization login, tenant IdP when the whole Instance is meant

**Human Identity Provider**:
The external system configured through **Instance Identity Configuration** that authenticates **Users**.
_Avoid_: auth provider when **App Connection** provider authentication is meant, WorkOS when the provider boundary is meant

**External Subject**:
The stable **Human Identity Provider** identifier bound to one **User**.
_Avoid_: email, username when durable identity is meant

**Instance Operator**:
A User authorized to administer an Instance through **Instance Configuration** and **Organization** creation outside **Public Onboarding**.
_Avoid_: service access, organization owner when the whole Instance is meant

**Bootstrap Secret**:
A one-time secret that authorizes **Instance Bootstrap** before normal authentication exists.
_Avoid_: bootstrap token when consumption and rotation are the concern

**Bootstrap Operator Claim**:
A one-time pending assignment that grants the first **Instance Operator** only after a **Human Identity Provider**-authenticated **User** presents the **Bootstrap Secret**.
_Avoid_: first user wins, local admin user

**Instance Bootstrap**:
The one-time flow that creates an Instance, its Instance Configuration, first Organization, and Bootstrap Operator Claim.
_Avoid_: first login, setup wizard when the one-time initialization flow is meant

**Organization**:
The tenant boundary that owns projects, memberships, machine identities, app connections, and audit log entries inside one Instance.
_Avoid_: account, workspace, tenant when "organization" is meant, instance when the deployment boundary is meant

**Organization Configuration**:
The non-secret settings that control one Organization within an Instance, such as approval policy, quotas, invitation restrictions, and organization-scoped webhook subscriptions.
_Avoid_: organization settings when the configured object is meant

**Webhook Subscription**:
A configured outbound delivery target with a selected event set that receives matching **Event Notifications**.
_Avoid_: webhook URL, callback when the managed subscription is meant

**Webhook Event Type**:
A named product event that may be selected when configuring a **Webhook Subscription**.
_Avoid_: audit action when the integrator-facing event name is meant

**Webhook Signing Secret**:
The shared secret used to HMAC-sign **Event Notifications** for one **Webhook Subscription**.
_Avoid_: webhook secret when rotation scope matters

**Webhook Signature**:
The HMAC over an **Event Notification** payload produced with the **Webhook Signing Secret**.
_Avoid_: signature header when the verification value is meant

**Event Notification**:
A metadata-safe outbound message delivered through a **Webhook Subscription**.
_Avoid_: webhook payload when the delivered message is meant

**User**:
A human actor who can receive access through memberships and is bound to one **External Subject**.
_Avoid_: account, member when referring to the person

**Organization Access**:
Access granted inside an organization or project through a membership and role.
_Avoid_: service access when the action is customer-scoped

**Service Access**:
Access granted to a User or Machine Identity to operate insecur across Organizations within a Hosted Instance for support, abuse response, incident investigation, and reliability.
_Avoid_: operator access, support access, platform user, instance operator when customer Instance administration is meant

**Public Onboarding**:
The externally available flow where a user can enter insecur and create or join organizations.
_Avoid_: signup when the user and organization boundaries matter

**Signup Lockdown**:
A security state that restricts public onboarding while existing Organizations continue normal authenticated access.
_Avoid_: maintenance mode, invite pause

**Tenant Suspension**:
A security state that restricts an organization's high-risk actions while preserving evidence and limited owner remediation access.
_Avoid_: deletion, ban when the organization still exists

**Invitation**:
A pending request for a user to receive exactly one organization- or project-scoped membership.
_Avoid_: signup link when membership is the target

**Agent**:
An automated tool that acts through a user or machine identity.
_Avoid_: bot user, script when the authentication boundary is meant

**Membership**:
The assignment that binds one **User**, **Team**, or **Machine Identity** to one **Organization** or **Project** scope and grants **Organization Access** there.
_Avoid_: permission, grant, WorkOS membership when the authorization assignment is meant

**Effective Access**:
The final set of **Authorization Scopes** an actor can use for one requested organization, project, environment, and action. Effective Access is the source of truth for authorization decisions.
_Avoid_: permission when the evaluated result is meant

**Authorization Scope**:
An atomic organization or project capability checked during **Organization Access** authorization.
_Avoid_: token scope when machine credential boundary is meant, permission when the named role bundle is meant

**Scope-First Authorization**:
An authorization model where **Effective Access** **Authorization Scopes** are evaluated for decisions, while **Roles** are assignment presets that contribute scopes.
_Avoid_: role check when the code evaluates scopes

**Role**:
A named assignment bundle of **Authorization Scopes** used for **User** and **Team** access assignments.
_Avoid_: permission when referring to the named bundle, policy check when Effective Access scopes are evaluated

**Built-In Role**:
A product-defined **Role** preset available without organization-specific role configuration.
_Avoid_: hard-coded permission, rule when access assignment is meant

**Approval Role**:
A **Built-In Role** preset whose **Authorization Scope** bundle authorizes protected-change approval and rejection without granting project or organization configuration authority or **Approval Request Cancellation** authority.
_Avoid_: approver permission when the Role is meant

**Organization Owner**:
A **User** with an owner **Role** **Membership** in one **Organization**.
_Avoid_: instance operator, admin when organization ownership is meant

**Credential Scopes**:
The explicit **Authorization Scopes** carried by a machine credential such as a **Machine Token** or short-lived access token issued to a **Machine Identity**.
_Avoid_: token scope when only the org/project/env boundary is meant, role when a machine credential is meant

**Team**:
A named collection of **Users** that may receive **Memberships** and **Roles** together.
_Avoid_: group, account when the Team object is meant

**Default Team**:
The automatically created non-authorizing **Team** for one **Organization** used as the initial team assignment target in V1.
_Avoid_: everyone group, implicit permission, implicit membership when the Team object is meant

**Project**:
A logical application or service whose secrets are managed together inside an organization.
_Avoid_: app, service when the managed secret boundary is meant

**Environment**:
A named deployment context inside a project, such as development, preview, staging, or production.
_Avoid_: stage, target when the project environment is meant

**Secret**:
A named value stored for a project environment.
_Avoid_: config, env var when referring to the managed record

**Sensitive Value**:
Plaintext material that can directly authenticate, decrypt, authorize secret delivery, or reveal a managed secret.
_Avoid_: actual secret, secret when the broader protected plaintext category is meant

**Secret Shape**:
The non-secret definition of a secret, such as name, description, required status, and generation hint.
_Avoid_: default when referring only to metadata

**Environment Default**:
A non-protected environment value intended for local or development delivery.
_Avoid_: production default

**Shared Secret Source**:
A single secret value explicitly attached to multiple environments.
_Avoid_: inherited secret, copied secret

**Secret Version**:
An immutable historical value for a secret.
_Avoid_: revision

**Blind Secret Write**:
A secret write that creates a Secret Version without returning the Sensitive Value to the caller.
_Avoid_: blind secret when implying a separate Secret type

**Draft Version**:
An immutable secret version that is stored but not eligible for protected delivery.
_Avoid_: staged value when the immutable version is meant

**Draft Area**:
The set of unpromoted Draft Versions available for review in one Protected Environment.
_Avoid_: staging environment when this is not a separate Environment

**Draft Version Discard**:
A terminal lifecycle action that removes an unpromoted **Draft Version** from the **Draft Area** so it cannot be selected for **Promotion**.
_Avoid_: delete secret when the protected value remains governed by audit/retention rules

**Draft Version Reuse**:
Including an existing unpromoted **Draft Version** in a fresh **Promotion Change Set** after an earlier **Approval Request** closed without **Promotion**.
_Avoid_: approval reuse, carry over approval

**Published Version**:
The secret version selected for delivery from a protected environment.
_Avoid_: current when protected delivery status is meant

**Retained Published Version**:
A prior **Published Version** kept encrypted and **Rollback**-eligible within the **Rollback Retention Window**.
_Avoid_: backup when no plaintext copy is kept, current version or published version when it is no longer the live version

**Current Version**:
The selected secret version for a secret.
_Avoid_: latest when the selected version is meant

**Secret Source of Truth**:
The selected secret value stored in insecur for a project environment.
_Avoid_: provider secret when the canonical value is meant

**Promotion**:
A secret lifecycle event that makes a secret version eligible for protected delivery.
_Avoid_: save, set when protected delivery is meant

**Promotion Change Set**:
An exact immutable set of Draft Versions requested for Promotion together.
_Avoid_: all staged changes

**Approval Request**:
A pending protected promotion or configuration change waiting for required human approval before it can affect delivery.
_Avoid_: notification when the approval object is meant

**Approval Request Supersession**:
Replacing a pending Approval Request with a newer Approval Request by marking the older request superseded.
_Avoid_: overwrite when implying in-place mutation

**Approval Request Rejection**:
An approval review decision that closes an **Approval Request** without **Promotion** or protected delivery changes.
_Avoid_: deny when authorization failure is meant, cancel when requester cancellation is meant

**Approval Request Cancellation**:
A requesting **User**, requesting **Machine Identity**, or administrative cleanup action that closes a pending **Approval Request** without **Promotion** or protected delivery changes.
_Avoid_: rejection when an approver review outcome is meant

**Approval Rejection Note**:
An optional untrusted, length-limited approver note recorded with an **Approval Request Rejection** to explain the rejection without becoming approval source of truth.
_Avoid_: required rejection reason, denial reason when authorization failure is meant

**Approval Impact Review**:
A metadata-only view of the current Secret Delivery and Secret Sync impact of an Approval Request.
_Avoid_: diff when implying Sensitive Values are compared

**Approval Impact Review Fingerprint**:
A stable metadata-only digest or version identifier for the server-generated facts in one **Approval Impact Review**.
_Avoid_: secret hash, value hash

**Approval Impact Snapshot**:
A persisted metadata-only record of the **Approval Impact Review** used for the final approval decision that caused **Promotion**.
_Avoid_: current impact, historical diff when the approval-time evidence is meant

**Current Impact Preview**:
An optional recomputed metadata-only view of current delivery and sync impact shown for investigation, without becoming historical approval evidence.
_Avoid_: approval impact snapshot, source of truth

**Approval Context Note**:
An optional untrusted, length-limited requester note shown with an Approval Request to explain intent without becoming approval source of truth. Approval Context Notes are Sensitive Metadata.
_Avoid_: approval summary when implying authoritative facts

**Approval Notification**:
An out-of-band alert that an Approval Request needs review, without being the approval review surface.
_Avoid_: approval email when the channel is not the concept

**Primary Approval Notification Channel**:
The preferred out-of-band channel for alerting approvers about Approval Requests, without granting approval authority.
_Avoid_: primary approval path when approval still happens in the authenticated approval view

**Push Device Registration**:
A user-owned browser or mobile app push registration used to deliver Approval Notifications to one device, browser, or app installation.
_Avoid_: push token when device ownership and revocation are the concern

**Startup Configuration**:
A value expected to be read when an application process, job, deploy, or provider runtime starts rather than changing continuously while it runs.
_Avoid_: dynamic config when runtime update behavior is required

**Protected Delivery Configuration Change**:
A change to where or how Protected Environment secrets may be delivered.
_Avoid_: config tweak when delivery authority changes

**Protected Approval Policy**:
The rule that decides how many human approvals are required before a protected change can affect delivery.
_Avoid_: two-person approval when the configured policy may require one or more approvers

**Protected Approval Policy Change**:
A high-assurance configuration mutation that changes the **Protected Approval Policy** for one **Protected Environment**.
_Avoid_: approval request when the V1 configuration mutation is meant

**Approval Policy Staleness**:
Closing a pending **Approval Request** without **Promotion** because the affected **Protected Approval Policy** changed before approval completed.
_Avoid_: auto-reapproval, policy migration when pending approval requirements changed

**Requester Access Staleness**:
Closing a pending **Approval Request** without **Promotion** because the requesting **User** or **Machine Identity** no longer has current authority for the affected **Project** and **Protected Environment** before approval completed.
_Avoid_: cancellation when no requester or admin explicitly closed it, rejection when no approver reviewed it

**Requester Self-Approval**:
An **Approval Request** approval by the same **User** who requested the protected change.
_Avoid_: auto-approval when the **High-Assurance Challenge** is still required

**Distinct Approver**:
A unique **User** whose approval can count at most once toward one **Protected Approval Policy** for one **Approval Request**.
_Avoid_: team approval, membership approval when the counted approver is meant

**Partial Approval**:
An approval recorded on an **Approval Request** before its **Protected Approval Policy** is satisfied.
_Avoid_: pre-approval, reusable approval

**Approver Access Revalidation**:
Checking that a **User** whose **Partial Approval** might count still has current approval authority for the affected **Project** and **Protected Environment** when the **Protected Approval Policy** threshold is evaluated.
_Avoid_: reapproval when checking whether a prior approval can still count

**Rollback**:
A secret lifecycle event that creates a new version from a retained older encrypted value and promotes it.
_Avoid_: revert, restore when referring to secret version promotion

**Rollback Retention Window**:
The configured period that keeps encrypted prior published versions eligible for emergency rollback.
_Avoid_: backup when no separate plaintext copy is meant

**Secret Egress**:
A controlled event where a plaintext secret value leaves encrypted storage for an approved destination.
_Avoid_: export when the broader movement of plaintext is meant

**Secret Delivery**:
Secret egress that supplies a plaintext secret value to an approved destination without returning it to the caller.
_Avoid_: reveal, print

**No Plaintext Persistence**:
The rule that Sensitive Values are never written to durable storage on insecur-controlled systems.
_Avoid_: encrypted at rest when plaintext persistence is the issue

**Secret-Free Logging**:
The rule that logs, traces, errors, audit metadata, and analytics never contain Sensitive Values.
_Avoid_: redacted when the value should never enter the log path

**Sensitive Metadata**:
Non-plaintext metadata that can reveal security-relevant structure, integrations, provider-side targets, provider-side secret or variable names, approval context, device routing, or relationships.
_Avoid_: safe metadata

**Sensitive Metadata Encryption**:
The rule that Sensitive Metadata is encrypted at rest under tenant-bound data keys, while only opaque resource IDs remain plaintext for joins and lookup.
_Avoid_: metadata-only when storage protection is meant

**Sensitive Detail Gate**:
A High-Assurance Challenge required before decrypted Sensitive Metadata is displayed in a User-facing surface or full-fidelity export.
_Avoid_: normal detail view when session hijack resistance is the issue

**Opaque Resource ID**:
A non-semantic identifier used for durable references, joins, and configured selectors.
_Avoid_: slug when a durable selector is meant

**Display Name**:
A user-authored product label stored as ordinary metadata for navigation, review, and scoped lookup after authentication and authorization. Display Names are not Sensitive Values or Sensitive Metadata.
_Avoid_: private name when a normal user-authored label is meant

**Scoped List**:
An authorized list bounded by Organization, Project, Environment, or resource scope that may display Display Names after authorization, and decrypted Sensitive Metadata only after authorization and Sensitive Detail Gate.
_Avoid_: search when configured discovery is meant

**Configured Selector**:
An opaque resource ID used to select a configured object without searching or storing plaintext Sensitive Metadata selectors.
_Avoid_: slug, search term

**Safe Sensitive Input Path**:
An input path for Sensitive Values that avoids URLs, query strings, route params, command arguments, logs, and shell history.
_Avoid_: value flag when the value itself is sensitive

**Misuse-Resistant Defaults**:
A product posture where ordinary management paths are easy, while accidental Sensitive Value exposure paths are absent, denied, or forced through explicit high-risk controls.
_Avoid_: idiot-proof, safe enough

**High-Assurance Challenge**:
A fresh human verification step required before actions that can expose Sensitive Metadata, expand protected delivery, expand provider reach, or change service-level control.
_Avoid_: MFA when the action boundary is meant

**Destructive Confirmation**:
An operation-scoped explicit confirmation that an actor intends a terminal cleanup or destructive action, without becoming approval evidence or a High-Assurance Challenge.
_Avoid_: approval, MFA when no high-assurance identity proof is required

**Runtime Injection**:
Secret delivery that supplies plaintext secret values to a child process at execution time.
_Avoid_: pull, export when the value is meant to be consumed only by the process

**Runtime Injection Policy**:
A server-owned rule that authorizes runtime injection for a constrained command shape and exact secret bindings.
_Avoid_: local config when the authorization rule is meant

**Runtime Injection Policy Version**:
An immutable snapshot of a runtime injection policy's bindings, command constraints, TTL, fingerprint requirements, and delivery behavior.
_Avoid_: current policy when reconstructing historical authorization

**Runtime Policy Version Retention**:
The rule that runtime injection policy versions are retained indefinitely as non-plaintext audit metadata.
_Avoid_: rollback retention when policy metadata retention is meant

**Runtime Policy Key**:
A stable opaque key that resolves to exactly one runtime injection policy.
_Avoid_: profile when the policy selector is meant

**Injection Grant**:
A short-lived authorization to perform one runtime injection under a runtime injection policy.
_Avoid_: token, reusable approval

**Command Fingerprint**:
A stable identifier for the command inputs approved by a runtime injection policy.
_Avoid_: command name when the approved command identity is meant

**Runtime Trust Boundary**:
The point after runtime injection where the child process can read delivered secret values.
_Avoid_: sandbox when no isolation guarantee exists

**Command Output Boundary**:
The rule that runtime-injected child process stdout and stderr are not captured or stored by insecur.
_Avoid_: command log when stdout/stderr is meant

**Forensic Traceability**:
The ability to reconstruct which actor, policy, command, secret versions, and delivery path caused a security-relevant event.
_Avoid_: observability when the security investigation trail is meant

**CLI Profile**:
A named non-secret CLI context that selects host, organization, project, environment, and default runtime policy.
_Avoid_: profile when user identity or provider account is meant

**Secret Reveal**:
Secret egress that returns a plaintext secret value to the caller.
_Avoid_: read, get when the exposure of plaintext is meant

**Secret Use**:
Permission to cause secret delivery without receiving the plaintext secret value.
_Avoid_: access when it could be confused with secret reveal

**Protected Environment**:
An environment whose secrets do not support secret reveal.
_Avoid_: production when the protection policy is meant

**Machine Identity**:
A non-human actor owned by an organization.
_Avoid_: bot user, service account

**Machine Token**:
A bearer credential associated with machine access.
_Avoid_: API key when referring to insecur-issued automation access

**Ephemeral CLI Credential**:
A short-lived credential held only in process memory or a child shell environment for one CLI session.
_Avoid_: saved token, credential cache

**Environment Deploy Key**:
A machine auth method scoped to one organization, project, and environment for runtime injection.
_Avoid_: deploy token when the environment boundary matters

**Deploy Key Rotation Policy**:
The configured expiration and rotation behavior for an environment deploy key.
_Avoid_: forever key when the configured policy is meant

**Token Scope**:
The boundary that limits where a machine token or access token can act.
_Avoid_: permission when referring to token boundaries

**Auth Method**:
The way a machine identity proves itself before receiving access.
_Avoid_: credential when the proof mechanism is meant

**App Connection**:
An organization-owned relationship with an external provider that can authorize secret syncs.
_Avoid_: integration when referring to the stored provider relationship

**Connection Method**:
The provider-specific way an app connection authenticates.
_Avoid_: auth method when referring to external provider authentication

**Provider App Registration**:
The Instance-scoped registration of an external provider's installable app or OAuth app, such as a GitHub App or Vercel Integration, that supplies the client identity and Instance-derived callback used by a **Connection Method**. Each **Instance** holds its own; a **Hosted Instance** and a **Self-Hosted Instance** differ only in who registers the provider app and owns its credentials.
_Avoid_: App Connection when the Instance-level provider app identity is meant, OAuth app when human authentication is meant, integration

**Provider Authorization Callback**:
The return from an external provider OAuth or app-install flow that may create, reauthorize, or replace an App Connection credential.
_Avoid_: login callback when the provider is authorizing a delivery integration

**Provider Account Linkage**:
The verified relationship between an App Connection and the external provider account, installation, team, repository, project, worker, or resource boundary it is allowed to control.
_Avoid_: connected account when the tenant boundary is the concern

**Provider Credential**:
A sensitive external-provider credential stored by an app connection.
_Avoid_: API key when the credential might be OAuth-derived or installation-derived

**Scoped Provider Token**:
A manually created external-provider token limited to a narrow provider account, resource, and permission set.
_Avoid_: global API key

**Credential Refresh**:
The automated, no-human renewal of a short-lived provider credential, available only for connection methods that support it: minting a `github-app` installation access token from the Provider App Registration, and exchanging a `vercel-integration-oauth` refresh token for a new access token. A `cloudflare` Scoped Provider Token has no Credential Refresh.
_Avoid_: rotation when no human action is involved, reauthorization for the automated renewal

**Credential Reauthorization**:
A human action that restores or replaces a provider credential when Credential Refresh is unavailable or has failed: re-running the OAuth or app-install flow for `github-app` and `vercel-integration-oauth`, or pasting a new Scoped Provider Token for `cloudflare`. Required on revocation, scope or boundary change, or refresh failure.
_Avoid_: refresh when human action is required, rotation when the provider relationship itself is re-established

**Connection Boundary**:
The provider resources an app connection is allowed to reach.
_Avoid_: blast radius when referring to the configured boundary

**Connection Boundary Warning**:
A metadata-only warning, recorded in audit, shown when an App Connection's granted provider scope is broader than least privilege, such as GitHub all-repositories, Vercel all-projects, or an overly broad Cloudflare token; insecur warns and records the accepted breadth but does not block on breadth alone.
_Avoid_: hard block, rejection when insecur only warns on a broad Connection Boundary

**Provider Drift**:
A mismatch between an approved app connection or secret sync configuration and the current provider account, installation, scope, target resource, or protection state.
_Avoid_: transient provider error when provider security state changed

**Secret Sync**:
A project-level rule that pushes explicitly bound environment secrets to a sync target through an app connection.
_Avoid_: integration, deploy, replication

**Secret Sync Binding**:
An exact mapping from one Secret in one Environment to one provider-side secret or variable name inside a Secret Sync.
_Avoid_: all secrets, tag selector, prefix selector

**Provider Sync Overwrite**:
A Secret Sync write that replaces the provider-side value for a bound destination without reading the previous provider-side Sensitive Value.
_Avoid_: import, reconcile

**Provider Overwrite Warning**:
A metadata-only warning that an exact Secret Sync Binding destination already exists in the provider and will be replaced by Provider Sync Overwrite if the sync is approved or run.
_Avoid_: import prompt, provider diff

**Sync Execution Revalidation**:
The pre-decrypt check that a Secret Sync run performs immediately before provider writes to confirm the current provider identity, boundary, target, protection state, and source version still match authorized configuration.
_Avoid_: plan validation when execution authorization is meant

**Secret Sync Disable**:
A non-destructive action that stops future Secret Sync writes while leaving existing provider-side managed copies in place.
_Avoid_: delete when pausing delivery

**Secret Sync Deletion**:
A destructive action that removes a Secret Sync, removes all of its bindings, and attempts to delete the provider-side copies managed by those bindings.
_Avoid_: disable when provider-side copies will be deleted

**Managed Provider Delete**:
A Secret Sync operation that deletes a provider-side secret or variable previously written for a removed Secret Sync Binding.
_Avoid_: cleanup when provider-side deletion is meant

**Orphaned Managed Provider Copy**:
A provider-side secret or variable whose cleanup state is unknown after insecur could not complete Managed Provider Delete.
_Avoid_: deleted when provider cleanup failed

**Immediate Sync After Promotion**:
The rule that promotion immediately enqueues enabled secret syncs affected by promoted versions.
_Avoid_: scheduled sync when no scheduling policy exists

**Provider Readback**:
Reading a Sensitive Value back from an external provider secret store.
_Avoid_: verification when only provider metadata or status is checked

**Secret Import**:
A controlled input workflow that creates insecur Secret Versions from Sensitive Values supplied through Safe Sensitive Input Paths.
_Avoid_: sync reconciliation, provider readback

**Explicit Provider Lookup**:
An audited provider API check for one exact configured Secret Sync Binding destination that returns minimal existence/status metadata for setup, planning, or approval without listing provider inventory or reading Sensitive Values.
_Avoid_: provider inventory discovery, provider list, standalone provider probe

**Provider Lookup Status**:
A normalized safe result code for Explicit Provider Lookup that replaces provider-native error text.
_Avoid_: raw provider error, provider message

**Operation**:
A trackable long-running workflow such as a sync, rotation, backup, restore, or provider reauthorization.
_Avoid_: job when referring to the user-visible workflow

**Sync Target**:
An external destination that receives secrets from a secret sync.
_Avoid_: environment when referring to an external provider destination

**GitHub Environment**:
A GitHub provider resource inside a repository used to scope Actions secrets and deployment behavior.
_Avoid_: Environment when the insecur project environment is meant

**GitHub Environment Protection**:
Provider-side protection rules on a GitHub Environment that make it acceptable for protected production secret sync; insecur's minimal bar is a deployment branch policy restricting the environment to selected or protected branches, with required reviewers recommended.
_Avoid_: environment exists when protection is meant, wait timer alone as sufficient protection

**GitHub Repository Secret**:
A repository-wide GitHub Actions secret scope that is an allowed Sync Target only for a non-protected insecur Environment; values written here are visible to every workflow in the repository.
_Avoid_: repo secret, organization secret, environment secret when the repository-wide scope is meant

**Cloudflare Secrets Store**:
An account-level Cloudflare secret vault that is the Sync Target for a cloudflare Secret Sync; insecur writes secrets into the store, and the customer binds stored secrets to Worker scripts outside insecur's Connection Boundary.
_Avoid_: Worker secret, per-script secret, Workers Secrets API when the account-level store is meant

**Vercel Deployment Target**:
The Vercel-side scope a vercel Secret Sync writes to, limited to production and preview because insecur writes only write-only sensitive variables, optionally narrowed to a git branch for preview; it is configured explicitly on the Sync Target, not inferred from the insecur source Environment.
_Avoid_: Environment when the insecur project environment is meant, target when the Sync Target as a whole is meant, development or custom environment as a supported insecur sync scope

**Organization Data Key**:
Encryption material scoped to organization-owned sensitive data.
_Avoid_: tenant key

**Project Data Key**:
Encryption material scoped to project secret data.
_Avoid_: secret key when referring to encryption material

**Key Version**:
A specific piece of key material tracked through its lifecycle.
_Avoid_: key revision

**Key Rotation**:
A planned key lifecycle event that replaces key material or provider authorization material.
_Avoid_: rekey when discussing the broader workflow

**Storage Security Gate**:
The required tenant-bound encryption baseline before production secret delivery or provider credential use can run.
_Avoid_: encryption done when the full storage baseline is meant

**Audit Log**:
An append-only history of meaningful authenticated actions and authorization denials.
_Avoid_: event log when the security record is meant

**Audit Export**:
A tenant-bounded artifact containing audit log entries for a time range.
_Avoid_: report when the exported evidence artifact is meant

## Relationships

- An **Instance** contains one or more **Organizations**.
- **Instance Bootstrap** requires a **Bootstrap Secret**.
- **Instance Bootstrap** creates an **Instance**, its **Instance Configuration**, the first **Organization**, and a **Bootstrap Operator Claim**.
- **Instance Bootstrap** installs enough **Instance Identity Configuration** for the configured **Human Identity Provider** before **Bootstrap Operator Claim** completion.
- A **Bootstrap Operator Claim** becomes the first **Instance Operator** only when a **Human Identity Provider**-authenticated **User** presents the **Bootstrap Secret** through a **Safe Sensitive Input Path**.
- Completing the first **Bootstrap Operator Claim** also creates an owner **Membership** for that **User** in the first **Organization**.
- Completing the first **Bootstrap Operator Claim** creates separate audit entries for the **Instance Operator** grant and the first **Organization** owner **Membership**.
- No **User** receives **Instance Operator** solely by being the first successful authentication.
- No temporary local-admin authentication path exists for **Instance Bootstrap**.
- A **Bootstrap Secret** is consumed or rotated immediately after successful **Bootstrap Operator Claim** completion.
- A **Bootstrap Secret** is a **Sensitive Value** and must enter through a **Safe Sensitive Input Path**.
- **Bounded Onboarding** is the V1 onboarding posture for **Small-Group Production**.
- A **Self-Hosted Instance** typically begins with locked onboarding until **Instance Bootstrap** completes.
- Self-hosting does not require a separate product codebase or deployment refactor.
- **Instance Bootstrap** is the one-time initialization flow for a new **Instance**; do not describe it as first login or signup.
- "bootstrap token" should be written as **Bootstrap Secret** when the one-time authorization secret is meant.
- A **Hosted Instance** and a **Self-Hosted Instance** use the same **Instance** capabilities and product shape; they differ in who holds **Instance Operator**, who owns the Cloudflare infrastructure, and default onboarding posture.
- On a **Hosted Instance**, normal customer work happens at the **Organization** layer through **Organization Access**.
- On a **Hosted Instance**, **Instance Operator** defaults to insecur administration and is not part of the normal customer experience.
- On a **Self-Hosted Instance**, the customer holds **Instance Operator** and may configure **Instance Configuration** freely, including rate limits.
- A **Self-Hosted Instance** supports one or more **Organizations**; the customer decides whether to create additional **Organizations** after bootstrap.
- Additional **Organizations** on a **Hosted Instance** for one enterprise customer may be added later without changing the **Instance** model.
- **Small-Group Production** uses the **Enterprise-Ready Model** without requiring every enterprise feature to exist first.
- Under **Bounded Onboarding**, only an **Instance Operator** creates **Organizations**.
- Under **Bounded Onboarding**, normal **Users** join **Organizations** through **Invitations** and **Memberships**.
- Under **Bounded Onboarding**, **Public Onboarding** may create **Users** only when needed to accept an **Invitation** or complete authentication through the **Human Identity Provider**.
- An **Instance** has one **Instance Configuration**.
- **Instance Identity Configuration** designates one **Human Identity Provider**.
- WorkOS AuthKit is the default **Human Identity Provider** configuration.
- Who may authenticate is configured in the **Human Identity Provider**, not through insecur **Public Onboarding**.
- First successful authentication may create a **User** bound to an **External Subject**.
- Authentication does not grant **Organization Access**; **Memberships** still do.
- **Membership** and **Organization Access** are owned by insecur, not by the **Human Identity Provider**.
- Directory or SCIM sync may create or update **Teams** or **Memberships** later, but insecur remains the source of truth for **Organization Access**.
- An **Instance** has one **Instance Identity Configuration**.
- **Instance Identity Configuration** applies to every **Organization** inside the **Instance**.
- **Organization**-scoped identity configuration is separate from **Instance Identity Configuration**.
- An **Organization** has one **Organization Configuration**.
- **Instance Configuration** controls how the **Instance** runs and who can authenticate.
- **Organization Configuration** controls how secrets are governed inside one **Organization**.
- A **Webhook Subscription** includes one or more selected **Webhook Event Types**.
- A **Webhook Subscription** delivers an **Event Notification** only when a selected **Webhook Event Type** occurs.
- An **Event Notification** identifies its **Webhook Event Type** with a stable event code.
- An **Event Notification** never contains **Sensitive Values**.
- An **Event Notification** excludes **Sensitive Metadata**.
- An **Event Notification** may contain opaque IDs, **Display Names**, stable event codes, timestamps, actors, and generic result status.
- Each **Webhook Subscription** has one **Webhook Signing Secret**.
- An **Event Notification** includes a **Webhook Signature** and timestamp.
- An **Event Notification** never contains the **Webhook Signing Secret**.
- **Webhook Signing Secret** rotation creates a new secret and retires the prior secret on a defined schedule or on demand.
- An **Instance** may have zero or more instance-scoped **Webhook Subscriptions**.
- An **Organization** may have zero or more organization-scoped **Webhook Subscriptions**.
- **Instance Operator** administers **Instance Configuration** and instance-scoped **Webhook Subscriptions**.
- **Organization Access** with sufficient permission administers **Organization Configuration** and organization-scoped **Webhook Subscriptions**.
- An **Instance Operator** administers one **Instance** through **Instance Configuration**.
- A **User** may be an **Instance Operator** for an Instance without having **Organization Access** in every **Organization** inside it.
- A **User** may be an **Organization Owner** without being an **Instance Operator**.
- **Instance Operator** and **Service Access** are separate boundaries. **Instance Operator** is customer-side Instance administration; **Service Access** is insecur platform operations on a **Hosted Instance**.
- **Signup Lockdown** restricts **Public Onboarding** and public **Organization** creation; **Instance Operators** may still create **Organizations**.
- A **Self-Hosted Instance Operator** may set **Instance Configuration** rate limits without insecur-imposed caps.
- An **Organization** belongs to exactly one **Instance**.
- An **Organization** owns zero or more **Projects**.
- An **Organization** owns zero or more **Machine Identities**.
- An **Organization** owns zero or more **App Connections**.
- An **Organization** owns **Audit Log** entries for actions within its boundary.
- A **User** can have **Memberships** in many **Organizations** and **Projects**.
- A **User** or **Machine Identity** receives **Organization Access** through **Memberships**.
- A **User** or **Machine Identity** may receive **Service Access** outside any customer **Organization**.
- **Public Onboarding** can create a **User** and, when broad public signup is enabled, may create an **Organization**.
- An **Invitation** can create a **Membership** for an existing **User**.
- An **Invitation** can create a **User** only through **Public Onboarding**.
- An **Invitation** targets exactly one **Membership** grant.
- An **Invitation** may target an **Organization**-scoped **Role** or a **Project**-scoped **Role**, but not both.
- An **Invitation** cannot bundle multiple **Memberships**.
- **Signup Lockdown** restricts **Public Onboarding**, new **User** creation, public **Organization** creation, and unauthenticated **Invitation** acceptance.
- **Signup Lockdown** does not restrict existing **User** login or existing **Membership** use.
- **Tenant Suspension** applies to one **Organization**.
- **Tenant Suspension** restricts high-risk **Secret Egress**, **Secret Sync**, **Runtime Injection**, **App Connection**, **Invitation**, and **Machine Identity** actions.
- **Tenant Suspension** preserves **Audit Log** history and limited owner remediation access.
- **Tenant Suspension** performs **Requester Access Staleness** for pending **Approval Requests** in the suspended **Organization**.
- **Tenant Suspension** does not pause pending **Approval Requests** for automatic resumption after reinstatement.
- After **Tenant Suspension** is lifted, protected changes still require fresh **Approval Requests** from currently authorized **Users** or **Machine Identities**.
- **Service Access** can include decrypted **Sensitive Metadata**.
- **Service Access** excludes **Secret Reveal**, **Secret Delivery**, and **Sensitive Values**.
- An **Agent** acts through one **Actor** at a time.
- A **Machine Identity** is owned by one **Organization**.
- V1 **Machine Identity** **Memberships** are **Project**-scoped only.
- Organization-scoped **Machine Identity** **Memberships** may be added later for organization-wide automation.
- **Membership** is the normalized grant concept for **Users**, **Teams**, and **Machine Identities**.
- Each **Organization** has one **Default Team** in V1.
- V1 creates the **Default Team** automatically when an **Organization** is created.
- The **Default Team** has no **Membership** or **Role** grant by default.
- Joining the **Default Team** does not grant **Organization Access** by itself.
- V1 treats **Team** as schema-ready but avoids rich team management, nested teams, directory sync, and SCIM workflows.
- A **Membership** links one **User**, **Team**, or **Machine Identity** to one **Organization** or **Project** scope.
- A V1 **Membership** for a **User** or **Team** carries one or more **Built-In Roles** for assignment UX.
- The **User** and **Team** **Membership** model is compatible with future explicit **Authorization Scope** grants, but V1 does not expose them for human/team assignment.
- A **Membership** for a **Machine Identity** carries explicit **Authorization Scopes**, not **Roles**.
- A **Membership** answers who may act in which **Organization** or **Project** scope.
- A **User** or **Team** **Membership** at **Organization** scope contributes **Authorization Scopes** that apply to **Projects** in that **Organization**.
- A **User** or **Team** **Membership** at **Project** scope contributes narrower project-scoped **Authorization Scopes**.
- V1 **Effective Access** for **Users** and **Teams** is additive; there are no deny rules or negative overrides.
- An **Organization Owner** has an owner **Role** **Membership** in exactly the **Organization** they own.
- **Organization Access** uses **Scope-First Authorization**.
- **Organization Access** authorization evaluates **Effective Access** **Authorization Scopes**, not **Role** names.
- A **Role** bundles **Authorization Scopes** for **User** and **Team** access assignments.
- V1 exposes **Built-In Roles** only for **User** and **Team** assignment: owner, admin, developer, approval, and read-only.
- V1 does not expose arbitrary human or team **Authorization Scope** editing.
- **Built-In Roles** are implemented as **Authorization Scope** bundles and should not be special-cased in authorization checks.
- The owner **Built-In Role** contributes approval **Authorization Scopes** for solo-owner operation.
- The admin and developer **Built-In Roles** do not contribute approval **Authorization Scopes**.
- The **Approval Role** is the additive **Built-In Role** for granting approval **Authorization Scopes** to non-owners where the **Protected Approval Policy** allows them, without contributing project configuration, **App Connection**, **Secret Sync**, **Runtime Injection Policy**, or membership management **Authorization Scopes**.
- The **Approval Role** does not authorize **Approval Request Cancellation** by itself.
- Approval **Authorization Scopes** may be contributed by **Organization**-scoped or **Project**-scoped **User** and **Team** **Memberships**.
- **Organization**-scoped approval **Authorization Scopes** apply to **Approval Requests** for **Protected Environments** in any **Project** in that **Organization**.
- **Project**-scoped approval **Authorization Scopes** apply only to **Approval Requests** for **Protected Environments** in that **Project**.
- The developer **Built-In Role** may contribute protected-change request **Authorization Scopes**, but **Approval Request** approval requires approval **Authorization Scopes** in the **User**'s **Effective Access**.
- A **User** may hold multiple **Roles** through **Memberships**, such as developer and approval for solo or small-group operation.
- Custom **Roles** or explicit human/team **Authorization Scope** assignments may be added later through **Organization Configuration** without changing how **Organization Access** is evaluated.
- A **Machine Identity** may receive **Organization Access** through project-scoped **Memberships** carrying explicit **Authorization Scopes**, without a **Role**.
- A V1 **Machine Identity** cannot receive **Organization Access** through an organization-scoped **Membership**.
- **Credential Scopes** attach directly to a machine credential and should be minimal for deploy automation.
- An **Environment Deploy Key** is an **Auth Method** for a **Machine Identity**, not the **Membership** actor itself.
- A short-lived access token issued from an **Environment Deploy Key** carries **Credential Scopes** that are no broader than one **Organization**, **Project**, and **Environment**.
- **Token Scope** limits where a machine credential may act; **Credential Scopes** limit what it may do there.
- **Effective Access** for a machine credential is the intersection of the **Machine Identity**'s **Memberships**, the credential's **Token Scope**, and the credential's **Credential Scopes**.
- A machine credential cannot use broader **Machine Identity** access than its own **Token Scope** and **Credential Scopes** allow.
- A machine credential cannot use **Credential Scopes** that exceed the **Machine Identity**'s **Memberships**.
- A **User** may belong to zero or more **Teams**.
- A **User** accepting an **Invitation** in V1 joins the **Default Team** unless the **Invitation** explicitly targets another **Team** in a later workflow.
- **Invitation** acceptance may create a **User**, a **Default Team** association, and the explicit **Membership** described by the **Invitation**.
- **Organization Access** for a **User** comes from direct **Memberships** and from **Memberships** assigned to a **Team** the **User** belongs to.
- **Effective Access** for machine credentials uses the same **Authorization Scope** vocabulary as **Roles**, but the credential-level assignment carrier is **Credential Scopes** rather than a **Role**.
- A **Project** belongs to exactly one **Organization**.
- A **Project** contains zero or more **Environments**.
- An **Environment** belongs to exactly one **Project**.
- An **Environment** contains zero or more **Secrets**.
- An **Environment** can share **Secret Shapes** with another **Environment**.
- An **Environment Default** belongs to exactly one non-protected **Environment**.
- A **Shared Secret Source** belongs to one **Project** and is explicitly attached to one or more **Environments**.
- A **Secret** has one or more **Secret Versions**.
- A **Blind Secret Write** creates one **Secret Version**.
- A **Blind Secret Write** is not a separate kind of **Secret**.
- A **Blind Secret Write** may use service-side generation so the caller never learns the **Sensitive Value**.
- A **Secret Version** may be a **Draft Version** before **Promotion**.
- A **Blind Secret Write** in a **Protected Environment** creates a **Draft Version**.
- A **Protected Environment** has a **Draft Area** for unpromoted **Draft Versions**.
- A **Draft Version Discard** applies only to unpromoted **Draft Versions**.
- The **User** or **Machine Identity** that created a **Draft Version** may perform **Draft Version Discard** for that **Draft Version** while it remains unpromoted and current **Effective Access** still covers the affected **Project** and **Protected Environment**.
- A **User** with scoped owner/admin cleanup **Authorization Scopes** for the affected **Project** and **Protected Environment** may perform **Draft Version Discard** for cleanup.
- **Draft Version Discard** does not reveal **Sensitive Values**.
- **Draft Version Discard** is audited.
- **Draft Version Discard** does not require an **Approval Request** or **High-Assurance Challenge** in V1 because it cannot cause **Promotion**, **Secret Delivery**, **Secret Sync**, or delivery configuration changes.
- Human UI and CLI **Draft Version Discard** require **Destructive Confirmation**.
- **Destructive Confirmation** for **Draft Version Discard** is operation-scoped, discard-specific, and not reusable for later operations.
- Human **Destructive Confirmation** for **Draft Version Discard** must show metadata-only discard impact before execution.
- **Draft Version Discard** impact shown during **Destructive Confirmation** includes exact **Draft Version** IDs, affected pending **Approval Request** IDs, that affected **Approval Requests** close without **Promotion**, that existing **Partial Approvals** become audit-only, and that encrypted **Sensitive Value** material will be crypto-erased.
- **Draft Version Discard** **Destructive Confirmation** must not show **Sensitive Values**, decrypted **Sensitive Metadata**, **Approval Context Notes**, or **Approval Rejection Notes**.
- The service computes the metadata-only **Draft Version Discard** impact and binds human **Destructive Confirmation** to that exact impact.
- The service revalidates the confirmed **Draft Version Discard** impact and actor **Effective Access** immediately before execution.
- If any selected **Draft Version** was promoted, already discarded, removed from the actor's authorized scope, or has a changed affected pending **Approval Request** set before execution, the stale **Destructive Confirmation** must not execute.
- Human UI and CLI flows require refreshed metadata-only impact and fresh **Destructive Confirmation** after **Draft Version Discard** impact revalidation fails.
- API and **Machine Identity** **Draft Version Discard** require exact **Draft Version** IDs; wildcard, query, tag, pattern, or "all drafts" selection is not supported.
- **Draft Version Discard** is idempotent for exact discarded **Draft Version** IDs: a repeated request observes the terminal discarded state and must not restore value material, reopen closed **Approval Requests**, or create **Promotion**.
- **Draft Version Discard** is terminal for the discarded **Draft Version**.
- A discarded **Draft Version** cannot return to the **Draft Area** or become promotable again.
- If the same **Sensitive Value** is still wanted after **Draft Version Discard**, the actor must create a new **Blind Secret Write** and a new **Draft Version**.
- **Draft Version Discard** crypto-erases the discarded **Draft Version**'s encrypted **Sensitive Value** material immediately in V1.
- **Draft Version Discard** retains tombstone and audit metadata needed for immutable approval facts, pending-request closure, audit export integrity, and investigation.
- After **Draft Version Discard** crypto-erasure, the discarded **Sensitive Value** is unrecoverable by product, admin, support, or restore flows.
- **Draft Version Reuse** is allowed only while the **Draft Version** still exists in the **Draft Area** and the affected **Project** and **Protected Environment** still accept protected **Promotion**.
- **Draft Version Reuse** requires a fresh **Promotion Change Set** and **Approval Request**.
- **Draft Version Reuse** cannot reuse the earlier **Approval Request**, **Partial Approvals**, **Approval Impact Review**, **Approval Impact Review Fingerprint**, **Approval Impact Snapshot**, or approval screen state.
- A discarded **Draft Version** cannot participate in **Draft Version Reuse**.
- Future retention/delete policy may decide how long **Draft Version Discard** tombstone metadata remains user-visible or exportable, but it must not restore value material, restore the discarded **Draft Version**, or make an old **Approval Request** approvable.
- A **Blind Secret Write** in a non-protected **Environment** may update the **Current Version** immediately.
- A **Protected Environment** has one **Protected Approval Policy**.
- A **Protected Approval Policy** may require one or more approving **Users**.
- A **Protected Approval Policy Change** requires a **User** with sufficient owner/admin configuration **Authorization Scopes** for the affected **Project** and **Protected Environment**.
- A **Protected Approval Policy Change** requires a **High-Assurance Challenge** in V1.
- A **Protected Approval Policy Change** is not an **Approval Request** in V1.
- A **Protected Approval Policy Change** cannot be authorized by the **Approval Role** or approval **Authorization Scopes** alone.
- A **Protected Approval Policy Change** is audited with actor, affected **Organization**, **Project**, **Protected Environment**, prior policy version or hash, new policy version or hash, and any pending **Approval Requests** made policy-stale.
- Future enterprise support may add approval for **Protected Approval Policy Changes** as a separate **Approval Request** purpose without changing promotion **Approval Request** semantics.
- Changing the **Protected Approval Policy** for a **Protected Environment** performs **Approval Policy Staleness** for any pending **Approval Request** in that **Protected Environment**.
- **Approval Policy Staleness** closes the pending **Approval Request** without **Promotion**, **Secret Delivery**, **Secret Sync**, or delivery configuration changes from that request.
- **Approval Policy Staleness** preserves existing **Partial Approvals** in audit history but makes them audit-only and unusable for delivery or future **Approval Requests**.
- **Approval Policy Staleness** leaves the request's **Draft Versions** in the **Draft Area** so the requester can create a fresh **Promotion Change Set** and **Approval Request** under the new **Protected Approval Policy**.
- A multi-approval **Protected Approval Policy** counts **Distinct Approvers**.
- One **User** can count at most once for one **Approval Request**, even if their **Effective Access** includes approval **Authorization Scopes** through multiple **Memberships**, **Roles**, or **Teams**.
- A **Team** may contribute approval **Authorization Scopes** through **Membership**, but a **Team** is not a **Distinct Approver** and cannot approve an **Approval Request** directly.
- A one-approval **Protected Approval Policy** permits **Requester Self-Approval** in V1 when the **User** has approval **Authorization Scopes** and completes the **High-Assurance Challenge**.
- A multi-approval **Protected Approval Policy** denies **Requester Self-Approval**.
- Requesting **Promotion** in a **Protected Environment** creates a **Promotion Change Set** and an **Approval Request**.
- An **Approval Request** has a requesting **User** or requesting **Machine Identity**.
- A **Promotion Change Set** belongs to one **Protected Environment**.
- A **Promotion Change Set** contains one or more exact **Draft Versions**.
- A **Promotion Change Set** cannot use wildcards or "all staged" selection.
- A **Promotion Change Set** is immutable after the **Approval Request** is created.
- **Draft Versions** created after an **Approval Request** are outside that request's **Promotion Change Set**.
- A fresh **Promotion Change Set** may include **Draft Versions** that were part of a rejected, canceled, superseded, policy-stale, requester-access-stale, or target-lifecycle-closed **Approval Request** when **Draft Version Reuse** is allowed.
- If a pending **Approval Request** includes a discarded **Draft Version** in its **Promotion Change Set**, the request closes without **Promotion**, **Secret Delivery**, **Secret Sync**, or protected delivery configuration changes.
- Existing **Partial Approvals** on an **Approval Request** closed by **Draft Version Discard** become audit-only and unusable for delivery or future **Approval Requests**.
- A draft-discard-closed **Approval Request** cannot be approved, rejected, or canceled.
- A draft-discard-closed **Approval Request** remains in the audit trail.
- An **Approval Request** does not expire by age in V1.
- An **Approval Request** remains pending until approved, rejected through **Approval Request Rejection**, canceled through **Approval Request Cancellation**, superseded, made policy-stale through **Approval Policy Staleness**, made requester-access-stale through **Requester Access Staleness**, or closed because **Draft Version Discard** removed a **Draft Version** in its **Promotion Change Set**.
- An **Approval Request** may create **Approval Notifications**.
- An **Approval Notification** is not an approval review surface.
- An **Approval Notification** contains low-privilege server-generated metadata only, such as **Approval Request** ID, generic purpose, created time, and a non-authorizing link to the authenticated approval view.
- A push **Approval Notification** payload is lock-screen safe: generic approval-pending text, opaque request reference, created time, and a non-authorizing deep link only.
- An **Approval Notification** must not include **Approval Context Note** plaintext.
- An **Approval Notification** must not include **Sensitive Values**, **Display Names** such as organization/project/environment/secret names, or decrypted **Sensitive Metadata** such as provider target names, provider-side names, policy binding names, or security-relevant relationships.
- **Approval Notification** channels may include in-app notifications, browser push, mobile push through a wrapped web app, email, or future channels.
- Browser push and mobile push through **Push Device Registrations** are the **Primary Approval Notification Channel** when available.
- In-app notifications and email are fallback **Approval Notification** channels.
- Browser push and mobile push may deep-link to the authenticated approval view, but the link is not an approval action and not a bearer approval token.
- Browser push and mobile push deep-links open an authenticated approval shell that may show **Display Names** and low-detail state, but not decrypted **Sensitive Metadata**, until the **Sensitive Detail Gate** is satisfied.
- Email **Approval Notifications** must not contain approve, reject, or other approval action links.
- **Approval Notification** deep links for approved, rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed **Approval Requests** resolve to the authenticated approval view and show closed or stale state.
- A closed or stale approval view reached from an **Approval Notification** must not expose approve, reject, cancel, **Promotion**, or delivery-changing actions for that **Approval Request**.
- A closed or stale approval view may show the original immutable **Approval Request** facts to currently authorized **Users**, including the **Promotion Change Set**, exact **Draft Version** IDs, status, actor IDs, timestamps, **Partial Approvals**, and closure, supersession, policy-stale, requester-access-stale, or draft-discard-closed state.
- A closed or stale approval view may show **Approval Context Notes** and **Approval Rejection Notes** only after authorization and **Sensitive Detail Gate**.
- Inspecting a closed or stale approval view must not satisfy a **Protected Approval Policy**, create or reuse **Partial Approvals**, create **Promotion**, change **Secret Delivery**, change **Secret Sync**, or change protected delivery configuration.
- In-app **Approval Notifications** should coalesce or update when an **Approval Request** is approved, rejected, canceled, superseded, made policy-stale, made requester-access-stale, or closed after **Draft Version Discard**.
- Optional closure **Approval Notifications** for approved, rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed **Approval Requests** must follow the same metadata-safe payload rules and must not include approval, rejection, cancellation, **Promotion**, or delivery action links.
- A **User** may have zero or more **Push Device Registrations**.
- A **Push Device Registration** belongs to exactly one **User** and one device, browser, or app installation.
- A **Push Device Registration** is **Sensitive Metadata**.
- Creating a new **Push Device Registration** or replacing its device, browser, app installation, or delivery endpoint requires a **High-Assurance Challenge**.
- A **Push Device Registration** can be revoked by the owning **User** from account security controls.
- **Push Device Registrations** are invalidated on logout-all, MFA reset, suspicious activity response, lost-device response, **User** offboarding, and membership removal where appropriate.
- A **Protected Environment** may have only one pending promotion **Approval Request**.
- Requesting **Promotion** again for the same **Protected Environment** creates a new immutable **Promotion Change Set** and **Approval Request**.
- Requesting **Promotion** again performs **Approval Request Supersession** for the prior pending promotion **Approval Request** in that **Protected Environment**, regardless of requester.
- **Approval Request Supersession** should coalesce **Approval Notifications** so approvers are pointed to the latest pending request.
- Deep links for superseded **Approval Requests** show stale/superseded state and may point an authorized **User** to the latest pending **Approval Request** without becoming an approval action.
- A superseded **Approval Request** cannot be approved, rejected, or canceled.
- A superseded **Approval Request** remains in the audit trail.
- A policy-stale **Approval Request** cannot be approved, rejected, or canceled.
- A policy-stale **Approval Request** remains in the audit trail.
- If the requesting **User** loses **Organization Access**, is suspended, or is offboarded before the **Approval Request** completes, **Requester Access Staleness** closes that pending **Approval Request**.
- If the requesting **Machine Identity** is disabled, loses **Organization Access**, or no longer has authorization for the affected **Project** and **Protected Environment** before the **Approval Request** completes, **Requester Access Staleness** closes that pending **Approval Request**.
- If the **Organization** enters **Tenant Suspension** before the **Approval Request** completes, **Requester Access Staleness** closes pending **Approval Requests** in that **Organization**.
- Short-lived machine credential expiry does not cause **Requester Access Staleness** by itself.
- For a **Machine Identity**-created **Approval Request**, **Requester Access Staleness** is caused by durable authority changes such as **Machine Identity** disablement, relevant **Membership** or **Authorization Scope** removal, **Tenant Suspension**, or revocation or disablement of the **Auth Method** used for the request.
- Normal **Environment Deploy Key** rotation that preserves the same active **Auth Method** does not cause **Requester Access Staleness** by itself.
- **Environment Deploy Key** rotation caused by compromise response causes **Requester Access Staleness** when it revokes, disables, or marks untrusted the **Auth Method** used for the pending **Approval Request**.
- **Requester Access Staleness** closes the pending **Approval Request** without **Promotion**, **Secret Delivery**, **Secret Sync**, or delivery configuration changes from that request.
- **Requester Access Staleness** preserves existing **Partial Approvals** in audit history but makes them audit-only and unusable for delivery or future **Approval Requests**.
- **Requester Access Staleness** leaves the request's **Draft Versions** in the **Draft Area** so a currently authorized **User** or **Machine Identity** may create a fresh **Promotion Change Set** and **Approval Request**.
- A requester-access-stale **Approval Request** cannot be approved, rejected, or canceled.
- A requester-access-stale **Approval Request** cannot become pending or approvable again if the requesting **User** or **Machine Identity** later regains access.
- A requester-access-stale **Approval Request** cannot become pending or approvable again after **Tenant Suspension** is lifted.
- A requesting **User** or **Machine Identity** that regains access may create a fresh **Approval Request** with current authority and a fresh **Approval Impact Review** if the change is still wanted.
- A requester-access-stale **Approval Request** remains in the audit trail.
- If the affected **Project** or **Protected Environment** is archived, deleted, or otherwise no longer accepts protected **Promotion** before the **Approval Request** completes, the pending **Approval Request** closes without **Promotion**, **Secret Delivery**, **Secret Sync**, or delivery configuration changes.
- An **Approval Request** closed because its affected **Project** or **Protected Environment** no longer accepts protected **Promotion** preserves audit history and makes existing **Partial Approvals** audit-only.
- Restoring or recreating an affected **Project** or **Protected Environment** must not make the old **Approval Request** pending or approvable again.
- Future **Project** or **Protected Environment** archive/delete behavior may name this closing condition, but the invariant is that a target-lifecycle change cannot silently preserve approval authority.
- Approval screens warn, but do not block, when newer **Draft Versions** exist outside the request's **Promotion Change Set**.
- The newer-draft warning should encourage the requester to request **Promotion** again if those **Draft Versions** should be included.
- A **Promotion Change Set** freezes **Draft Version** identity only.
- A **Promotion Change Set** does not freeze **Secret Sync**, **Runtime Injection Policy**, **App Connection**, or other delivery target configuration.
- An **Approval Impact Review** is recomputed before **Approval Request** approval.
- An **Approval Impact Review** contains metadata only and excludes **Sensitive Values**.
- An **Approval Impact Review** has an **Approval Impact Review Fingerprint** derived from the server-generated delivery and sync impact facts being reviewed.
- An **Approval Impact Review Fingerprint** must not be derived from **Sensitive Values**.
- An **Approval Impact Snapshot** is persisted when an approval satisfies the **Protected Approval Policy** and causes **Promotion**.
- An **Approval Impact Snapshot** records the metadata-only delivery and sync impact from the accepted **Approval Impact Review** used for the final approval decision.
- An **Approval Impact Snapshot** is the historical source of truth for what delivery and sync impact the final approver acted on.
- An **Approval Impact Snapshot** excludes **Sensitive Values**.
- Decrypted **Sensitive Metadata** inside an **Approval Impact Snapshot** remains gated by **Sensitive Detail Gate**.
- Rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed **Approval Requests** do not require an **Approval Impact Snapshot** in V1.
- Closed or stale approval views for rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed **Approval Requests** may show a clearly labeled **Current Impact Preview**.
- A **Current Impact Preview** must not be treated as historical source of truth, used to satisfy approval requirements, used to create or reuse **Partial Approvals**, or used to perform **Promotion**.
- An **Approval Request** may include one **Approval Context Note**.
- An **Approval Context Note** may be written by a **User** or **Agent**.
- An **Approval Context Note** is untrusted text.
- An **Approval Context Note** is **Sensitive Metadata**.
- An **Approval Context Note** is length-limited, escaped for display, and visually separated from server-generated approval facts.
- An **Approval Context Note** is encrypted at rest and excluded from plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, and low-privilege audit exports.
- Low-privilege references to an **Approval Context Note** use immutable IDs, hashes, lengths, or presence flags.
- An **Approval Context Note** must not be rendered as HTML, used as markdown with active links, used to suppress warnings, used to choose **Draft Versions**, used to choose delivery targets, or used to satisfy approval requirements.
- Approval screens use server-generated **Promotion Change Set** and **Approval Impact Review** facts as the approval source of truth.
- If delivery or sync impact changed after an approval screen loaded, approval must return `approval.review_stale` and require a fresh **Approval Impact Review**.
- A stale **Approval Impact Review** does not cancel or supersede the **Approval Request**.
- An **Approval Request** has exactly one approval purpose in V1.
- A promotion **Approval Request** contains one **Promotion Change Set** and no **Protected Delivery Configuration Changes**.
- A **Protected Delivery Configuration Change** requires a separate **Approval Request** or separate **High-Assurance Challenge**.
- **Protected Delivery Configuration Changes** include protected **Secret Sync** create/enable/binding changes, protected **Runtime Injection Policy** changes, protected **App Connection** changes, **Connection Boundary** changes, protected **Shared Secret Source** attachment, and repository-scoped provider sync overrides.
- Approving **Promotion** must not create, enable, or change a delivery target.
- An **Approval Request** can be approved by a **User** through a **High-Assurance Challenge**.
- **Approval Request** approval evaluates the approving **User**'s **Effective Access** for the **Project** and **Protected Environment** affected by the request.
- An **Approval Request** approval can perform **Promotion** of its **Promotion Change Set** when the **Protected Approval Policy** is satisfied.
- An **Approval Request** approval creates a **Partial Approval** when the **Protected Approval Policy** is not yet satisfied.
- A **Partial Approval** belongs to exactly one **Approval Request** and one **Promotion Change Set**.
- A **Partial Approval** records the **Approval Impact Review Fingerprint** it approved.
- A **Partial Approval** counts toward a **Protected Approval Policy** only while the current **Approval Impact Review Fingerprint** matches the fingerprint recorded on that **Partial Approval**.
- If **Secret Delivery** or **Secret Sync** impact changes after a **Partial Approval** and before the **Protected Approval Policy** is satisfied, that **Partial Approval** becomes audit-only and fresh approval is required against the new **Approval Impact Review**.
- A **Partial Approval** counts toward a **Protected Approval Policy** only if its approving **User** passes **Approver Access Revalidation** when the approval threshold is evaluated.
- **Approver Access Revalidation** requires the approving **User** to be active, not suspended or offboarded, and to have current approval **Authorization Scopes** for the affected **Project** and **Protected Environment**.
- If the approving **User** loses approval access before the **Protected Approval Policy** threshold is satisfied, that **Partial Approval** remains in audit history but becomes audit-only and fresh approval is required.
- A **Partial Approval** that becomes audit-only because **Approver Access Revalidation** failed cannot become countable again if the approving **User** later regains approval access.
- A **User** who regains approval access may approve the same pending **Approval Request** again only through a fresh **Approval Impact Review**, current **Effective Access**, and a new **High-Assurance Challenge**.
- A **Partial Approval** cannot be reused by any later **Approval Request**.
- An **Approval Request** can be rejected by a **User** through a **High-Assurance Challenge** when the **User** has approval **Authorization Scopes** for the affected **Project** and **Protected Environment**.
- **Approval Request Rejection** closes the **Approval Request** without **Promotion**, **Secret Delivery**, **Secret Sync**, or protected delivery configuration changes.
- **Approval Request Rejection** leaves the request's **Draft Versions** in the **Draft Area** so a requester may create a later **Promotion Change Set** and **Approval Request**.
- **Approval Request Rejection** may include one **Approval Rejection Note**.
- An **Approval Rejection Note** is optional in V1.
- A V1 **Protected Approval Policy** does not require an **Approval Rejection Note**.
- An **Approval Rejection Note** may be written by the rejecting **User**.
- An **Approval Rejection Note** is untrusted text.
- An **Approval Rejection Note** is **Sensitive Metadata**.
- An **Approval Rejection Note** is length-limited, escaped for display, and visually separated from server-generated rejection facts.
- An **Approval Rejection Note** is encrypted at rest and excluded from plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, and low-privilege audit exports.
- Low-privilege references to an **Approval Rejection Note** use immutable IDs, hashes, lengths, or presence flags.
- An **Approval Rejection Note** must not be rendered as HTML, used as markdown with active links, used to choose **Draft Versions**, used to choose delivery targets, suppress warnings, or drive policy decisions.
- An **Approval Request** can be canceled while it is pending.
- A pending **Approval Request** may be canceled after one or more **Partial Approvals** exist, as long as the **Protected Approval Policy** has not been satisfied and **Promotion** has not happened.
- The requesting **User** may perform **Approval Request Cancellation** for their own pending **Approval Request** with a normal authenticated session.
- The requesting **Machine Identity** may perform **Approval Request Cancellation** only for its own pending **Approval Request** with a currently valid machine credential whose **Effective Access** still covers the affected **Project** and **Protected Environment**.
- The requesting **Machine Identity** may perform **Approval Request Cancellation** for its own pending **Approval Request** after one or more human **Partial Approvals** exist, as long as the **Protected Approval Policy** has not been satisfied and **Promotion** has not happened.
- **Machine Identity** **Approval Request Cancellation** does not require a recorded **User** instruction in V1; authorization comes from the current machine credential and current **Effective Access**.
- When **Machine Identity** **Approval Request Cancellation** is caused by an **Agent** run, task, or **User** instruction, available correlation IDs should be recorded in audit history without becoming authorization source of truth.
- A **Machine Identity** cannot cancel an **Approval Request** created by a **User** or another **Machine Identity**.
- **Approval Request Cancellation** does not require a **High-Assurance Challenge** in V1.
- A **User** with sufficient owner/admin configuration **Authorization Scopes** for the affected **Project** and **Protected Environment** may perform **Approval Request Cancellation** for cleanup.
- Approval **Authorization Scopes** alone do not authorize **Approval Request Cancellation**.
- A **User** with approval **Authorization Scopes** who is neither the requester nor a scoped owner/admin cleanup actor must use **Approval Request Rejection**, not **Approval Request Cancellation**, to close an **Approval Request** as a review outcome.
- **Approval Request Cancellation** closes the **Approval Request** without **Promotion**, **Secret Delivery**, **Secret Sync**, or protected delivery configuration changes.
- **Machine Identity** **Approval Request Cancellation** does not approve, reject, satisfy a **Protected Approval Policy**, or change delivery.
- **Approval Request Cancellation** invalidates **Partial Approvals** for delivery and future **Approval Requests** while preserving them in audit history.
- **Approval Request Cancellation** leaves the request's **Draft Versions** in the **Draft Area** so a requester may create a later **Promotion Change Set** and **Approval Request**.
- A **Machine Identity** cannot approve or reject an **Approval Request**.
- **Service Access** cannot approve or reject customer **Approval Requests**.
- A **Protected Environment** delivers only **Published Versions**.
- A **Secret** has exactly one **Current Version** once it has a value.
- A **Current Version** is the default **Secret Source of Truth** for non-protected delivery.
- A **Published Version** is the **Secret Source of Truth** for protected delivery.
- A **Promotion** makes every **Draft Version** in its **Promotion Change Set** a **Published Version** for protected delivery.
- **Promotion** triggers **Immediate Sync After Promotion** for enabled **Secret Syncs** affected by any promoted version in the **Promotion Change Set**.
- Environment-based **Secret Delivery** is for **Startup Configuration**.
- Rapidly changing values are not **Startup Configuration** and should not be modeled as repeated protected **Promotion** requests.
- A **Rollback** creates a new **Secret Version** from an older retained encrypted **Secret Version** and promotes it.
- A **Rollback Retention Window** controls how long older **Published Versions** remain rollback-eligible.
- **No Plaintext Persistence** applies to **Sensitive Values**.
- **Secret-Free Logging** applies to every **Secret Egress**, **Secret Sync**, **Runtime Injection**, and **Operation**.
- A **Sensitive Value** may be a **Secret** value, **Provider Credential**, machine auth credential, deploy key, bootstrap secret, OIDC token, data key, DEK, or root key material.
- **Sensitive Metadata** requires **Sensitive Metadata Encryption** before durable storage.
- **Opaque Resource IDs** are the only plaintext durable selectors for server-side resources.
- **Sensitive Detail Gate** is required before any User-facing surface or full-fidelity export displays decrypted **Sensitive Metadata**.
- **Display Names** are ordinary metadata and can appear in authorized app surfaces, **Scoped Lists**, approval review, and scoped lookup without a **Sensitive Detail Gate**.
- Low-detail surfaces may show **Opaque Resource IDs**, **Display Names**, counts, status, hashes, lengths, presence flags, and generic pending states without a **Sensitive Detail Gate**.
- **Sensitive Values** enter insecur only through **Safe Sensitive Input Paths**.
- **Misuse-Resistant Defaults** make **Secret Use** easier than **Secret Reveal**.
- A **Secret Egress** moves a **Secret** value through either **Secret Delivery** or **Secret Reveal**.
- **Runtime Injection** is a kind of **Secret Delivery**.
- A **CLI Profile** can select defaults for **Runtime Injection**.
- A **CLI Profile** may reference one **Runtime Policy Key** by opaque ID.
- A **Runtime Policy Key** is a **Configured Selector**.
- A **Runtime Policy Key** resolves to exactly one **Runtime Injection Policy**.
- A **Runtime Injection Policy** has one or more immutable **Runtime Injection Policy Versions**.
- The active **Runtime Injection Policy Version** authorizes **Runtime Injection** for exact **Secret** bindings.
- **Runtime Policy Version Retention** preserves **Runtime Injection Policy Versions** independently of **Rollback Retention Window**.
- A **Runtime Injection Policy Version** stores immutable secret IDs and historical **Display Names** as ordinary metadata, while provider-side names, policy binding names, and security-relevant relationships remain **Sensitive Metadata**.
- An **Injection Grant** is issued from exactly one **Runtime Injection Policy Version**.
- An **Injection Grant** is fresh, one-use, and non-reusable.
- A **Runtime Injection Policy Version** may require a **Command Fingerprint**.
- **Runtime Injection** crosses the **Runtime Trust Boundary** when the child process starts.
- **Runtime Injection** obeys the **Command Output Boundary**.
- **Secret Use** allows **Secret Delivery** without **Secret Reveal**.
- A **Protected Environment** contains zero or more non-revealable **Secrets**.
- **Secret Reveal** can apply only outside **Protected Environments**.
- **Protected Environment** break-glass may use **Secret Delivery**, replacement, reauthorization, or **Rollback**, but not **Secret Reveal**.
- A **High-Assurance Challenge** gates **Sensitive Detail Gate**, protected **Approval Request** approval or rejection, protected **Promotion**, protected **Rollback**, protected **Secret Import**, protected **Secret Sync** enable/run, **Protected Approval Policy Changes**, protected **Runtime Injection Policy** changes, protected **App Connection** changes, protected **Shared Secret Source** attachment, **Push Device Registration** creation/replacement, and mutating **Service Access** controls.
- A **Machine Identity** cannot satisfy a **High-Assurance Challenge**.
- A **Machine Identity** may create **Blind Secret Writes** and request **Promotion** if **Organization Access** allows it.
- A **Machine Identity** may cancel its own pending **Approval Request** when its current machine credential and **Effective Access** still authorize the affected **Project** and **Protected Environment**.
- A recorded **User** instruction is audit correlation for **Machine Identity** **Approval Request Cancellation**, not required authorization in V1.
- A **Machine Identity** may use exact policies or operations previously authorized by a **User** through a **High-Assurance Challenge**.
- A **Machine Identity** proves itself through an **Auth Method**.
- A **Machine Identity** may use an **Environment Deploy Key** as an **Auth Method**.
- A **Machine Token** is constrained by a **Token Scope**.
- Short-lived **Machine Token** or access token expiry does not revoke the **Machine Identity** or its **Auth Method**.
- An **Ephemeral CLI Credential** belongs to one CLI session and is not persisted to disk.
- An **Environment Deploy Key** can exchange for short-lived access within one **Environment**.
- An **Environment Deploy Key** has one **Deploy Key Rotation Policy**.
- Normal **Environment Deploy Key** rotation may replace credential material while preserving the same active **Auth Method**.
- Revoking, disabling, or marking an **Environment Deploy Key** **Auth Method** untrusted is a durable authority change.
- An **Environment Deploy Key** can authorize only allowlisted **Runtime Policy Keys**, not arbitrary **Runtime Injection**.
- An **Environment Deploy Key** cannot choose its own secret set, command shape, or **Command Fingerprint**.
- An **Environment Deploy Key** can authorize **Runtime Injection**, not **Secret Sync**.
- Exact **Runtime Injection Policy** bindings support **Forensic Traceability**.
- An **App Connection** uses one **Connection Method**.
- A **Connection Method** that uses a provider app-install or OAuth flow resolves its client identity and callback from a **Provider App Registration** on the **Instance**.
- A **Provider App Registration** belongs to one **Instance** and one app-install or OAuth **Connection Method**.
- A scoped-token **Connection Method** such as Cloudflare `scoped-api-token` has no **Provider App Registration**.
- Both a **Hosted Instance** and a **Self-Hosted Instance** use **Provider App Registrations**; only the registrant and credential owner differ.
- A **Provider Authorization Callback** for an app-install or OAuth **Connection Method** returns to the callback of the **Instance**'s **Provider App Registration**.
- An **App Connection** may store one or more **Provider Credentials**.
- An **App Connection** has one **Connection Boundary**.
- insecur does not reject a broad provider scope; it raises a **Connection Boundary Warning** at connect time and in **Secret Sync** plans and audits the accepted breadth.
- A **Connection Boundary Warning** is metadata-only and excludes **Sensitive Values** and provider inventory.
- An **App Connection** has one verified **Provider Account Linkage**.
- A **Provider Authorization Callback** can create or replace **Provider Credentials** only for one pending **App Connection** operation.
- A **Provider Authorization Callback** is bound to exactly one **Organization**, initiating **User**, pending **App Connection** or reauthorization operation, **Connection Method**, and intended **Connection Boundary**.
- A **Provider Authorization Callback** must re-check the initiating **User's** **Organization Access** before persisting **Provider Credentials** or changing **Provider Account Linkage**.
- A **Provider Authorization Callback** must verify the external provider account, installation, team, repository, project, worker, or resource identity before persisting **Provider Account Linkage**.
- A **Provider Authorization Callback** must not allow one **Organization** to link provider resources into another **Organization**.
- A **Provider Credential** must pass the **Storage Security Gate** before production **Secret Sync** can use it.
- A **Scoped Provider Token** is a **Provider Credential**.
- A `github-app` **App Connection** stores only its installation reference, **Provider Account Linkage**, and **Connection Boundary**, not an organization-level **Provider Credential**; installation access tokens are minted on demand from the **Instance**'s **Provider App Registration** and held in memory only.
- A `vercel-integration-oauth` **App Connection** stores a per-connection **Provider Credential**, the integration access token and its refresh token, as encrypted organization data.
- A `cloudflare` `scoped-api-token` **App Connection** stores a per-connection **Scoped Provider Token** as encrypted organization data.
- A `github-app` **App Connection** renews access through **Credential Refresh** only and never needs a stored long-lived secret; **Credential Reauthorization** is the install or repo-selection change.
- A `vercel-integration-oauth` **App Connection** renews access through **Credential Refresh** using its refresh token; **Credential Reauthorization** re-runs OAuth when the refresh token is revoked or scope changes.
- A `cloudflare` `scoped-api-token` **App Connection** has no **Credential Refresh**; replacing the token is always a manual **Credential Reauthorization**, so it carries recurring rotation burden and the highest **Provider Drift** risk.
- A failed **Credential Refresh** surfaces as **Provider Drift** and requires **Credential Reauthorization**; production **Secret Sync** fails closed until it succeeds.
- A **Secret Sync** belongs to one **Project**.
- A **Secret Sync** uses one **App Connection** to write to one **Sync Target**.
- A **Secret Sync** has one or more exact **Secret Sync Bindings**.
- A **Secret Sync** performs **Sync Execution Revalidation** before decrypting **Sensitive Values** or writing provider-side values.
- A **Secret Sync** plan may use cached provider metadata, but cached planning metadata does not authorize decrypt or provider writes.
- **Sync Execution Revalidation** checks **Provider Account Linkage**, **Connection Boundary**, provider credential scope, **Sync Target** identity, provider-side resource identity, required provider protection state, and eligible source version.
- **Sync Execution Revalidation** fails closed on **Provider Drift**.
- **Provider Drift** during **Sync Execution Revalidation** returns stable code `sync.provider_drift`.
- **Provider Drift** blocks **Sensitive Value** decrypt and provider writes.
- Resolving **Provider Drift** requires **Credential Reauthorization** or a configuration change; if a **Protected Environment** is involved, that configuration change is a **Protected Delivery Configuration Change**.
- A **Secret Sync Binding** references one **Secret** in the **Secret Sync** source **Environment**.
- A **Secret Sync Binding** names one provider-side destination secret or variable.
- **Secret Sync** does not support all-secrets, tag, prefix, suffix, regex, folder, or pattern-based selection.
- Adding a **Secret** to an **Environment** does not add it to an existing **Secret Sync**.
- Changing **Secret Sync Bindings** for a **Protected Environment** is a **Protected Delivery Configuration Change**.
- A **Secret Sync Binding** is authoritative for its provider-side destination.
- A **Secret Sync** run performs **Provider Sync Overwrite** for every bound destination it writes.
- **Provider Sync Overwrite** does not perform **Provider Readback**.
- Existing provider-side **Sensitive Values** are not imported, compared, preserved, or shown during **Provider Sync Overwrite**.
- **Explicit Provider Lookup** can check whether an exact **Secret Sync Binding** destination already exists before sync approval or execution.
- Existing exact bound destinations produce a **Provider Overwrite Warning**.
- A **Provider Overwrite Warning** tells the **User** that approval or execution will replace the provider-side value without reading, comparing, preserving, or showing it.
- Approving protected **Secret Sync** creation, enablement, or binding changes authorizes **Provider Sync Overwrite** for the exact bound destinations shown in the approval.
- Removing a **Secret Sync Binding** creates a **Managed Provider Delete** for the provider-side secret or variable previously managed by that binding.
- **Managed Provider Delete** uses provider metadata and tracked managed-key identity, not **Sensitive Values**.
- **Secret Sync Disable** does not create a **Managed Provider Delete**.
- Disabled **Secret Sync** status and plan output must warn when provider-side managed copies still exist.
- **Secret Sync Deletion** removes every **Secret Sync Binding** and creates a **Managed Provider Delete** for each provider-side managed copy.
- **Secret Sync Deletion** is destructive and must show every planned **Managed Provider Delete** before confirmation.
- **Secret Sync Deletion** tombstones the **Secret Sync** for audit instead of erasing its history.
- **Secret Sync Deletion** can tombstone the **Secret Sync** even when some **Managed Provider Deletes** fail.
- Failed **Managed Provider Deletes** create **Orphaned Managed Provider Copies**.
- An **Orphaned Managed Provider Copy** may or may not still exist in the provider.
- An **Orphaned Managed Provider Copy** does not mean insecur knows or stores the provider-side **Sensitive Value**.
- **Orphaned Managed Provider Copies** must be shown to the **User** as warnings and preserved for retry cleanup.
- **Orphaned Managed Provider Copy** warnings use stable warning code `sync.provider_delete_incomplete`.
- **Orphaned Managed Provider Copy** warnings are not critical platform failures.
- **Secret Sync Deletion** for a **Protected Environment** is a **Protected Delivery Configuration Change**.
- A **Secret Sync** may be enabled or disabled.
- A **Secret Sync** does not perform **Provider Readback**.
- **Secret Import** uses **Safe Sensitive Input Paths**.
- **Secret Import** is separate from **Secret Sync** verification.
- **Secret Import** does not read **Sensitive Values** from provider secret stores in V1.
- Existing provider-side destinations can be detected during **Secret Sync** setup and planning to produce **Provider Overwrite Warnings** for exact bindings.
- **Explicit Provider Lookup** is not a standalone UI, API, or CLI probe in V1.
- **Explicit Provider Lookup** is scoped to one **App Connection**, **Connection Boundary**, provider target, and exact provider-side name or binding.
- **Explicit Provider Lookup** does not list provider inventories, enumerate provider-side secret or variable names, or return unrelated provider objects.
- **Explicit Provider Lookup** returns only minimal existence/status metadata, **Provider Lookup Status**, safe hashes or opaque IDs where needed, and no raw provider bodies or **Sensitive Values**.
- **Provider Lookup Status** uses stable codes such as `provider.lookup_not_found`, `provider.permission_denied`, `provider.boundary_mismatch`, and `provider.unavailable`.
- **Provider Lookup Status** must not include provider-native error text, raw provider bodies, raw provider headers, stack traces, unrelated provider object names, or **Sensitive Values**.
- **Explicit Provider Lookup** is audited with actor, organization, project/environment when applicable, app connection, exact target/name/binding, provider response class, request ID, and operation ID.
- **Protected Environment** **Secret Sync** setup, approval, enablement, and manual run require a completed **Explicit Provider Lookup** for every exact **Secret Sync Binding** destination.
- If **Explicit Provider Lookup** cannot determine the safe status for any exact **Protected Environment** binding, the protected setup, approval, enablement, or run fails closed with `provider.unavailable`.
- If **Explicit Provider Lookup** cannot determine the safe status for any exact non-protected **Environment** binding, the non-protected setup, enablement, or run may continue only after a user-visible warning, explicit confirmation for that operation, and an audit event.
- The warning tells the **User** that provider overwrite status is unknown and the sync may replace a provider-side value without reading, comparing, preserving, or showing it.
- Unknown provider overwrite warning output must not include provider-native error text, raw provider bodies, provider inventories, unrelated provider object names, or **Sensitive Values**.
- Generic confirmation, stored defaults, previous confirmation, and unrelated **Approval Requests** cannot authorize an unknown provider overwrite.
- Enabling or running a **Secret Sync** requires every binding to have an insecur-managed value: **Current Version** for non-protected **Environments** and **Published Version** for **Protected Environments**.
- Enabling or running a **Secret Sync** fails with `sync.source_value_missing` when a binding has no eligible version.
- An **Orphaned Managed Provider Copy** is cleanup metadata and is not a **Secret Import** source.
- The **Sync Target** for a `github-app` **Secret Sync** is either a **GitHub Repository Secret** scope or a **GitHub Environment** inside a repository, chosen explicitly on the **Secret Sync** within the installation **Connection Boundary**; insecur does not infer it from the source **Environment** name.
- A protected **Environment** `github-app` **Secret Sync** must target a **GitHub Environment** with **GitHub Environment Protection** and cannot target a **GitHub Repository Secret**.
- **GitHub Environment Protection** is satisfied at minimum by a deployment branch policy restricting the **GitHub Environment** to selected or protected branches; a wait timer alone does not satisfy it, and required reviewers are recommended.
- A non-protected **Environment** `github-app` **Secret Sync** may target either a **GitHub Repository Secret** or a **GitHub Environment**.
- insecur does not write organization-level GitHub Actions secrets; organization-wide scope lies outside the **Project** **Connection Boundary**.
- The **Sync Target** for a `cloudflare` **Secret Sync** is a **Cloudflare Secrets Store** in the account **Connection Boundary**, not an individual Worker script.
- insecur writes and overwrites secrets in the **Cloudflare Secrets Store**; binding stored secrets to Workers is the customer's responsibility and lies outside insecur's **Connection Boundary**.
- A **Managed Provider Delete** for a `cloudflare` binding deletes the secret from the **Cloudflare Secrets Store**, which can break Workers still bound to it.
- The **Sync Target** for a `vercel` **Secret Sync** is one **Vercel Project** in the **Connection Boundary** plus an explicit **Vercel Deployment Target** scope; insecur does not infer the scope from the source **Environment** name.
- A `vercel` **Vercel Deployment Target** scope is one or more of `production` and `preview`, and a `gitBranch` may narrow a `preview` scope.
- insecur writes every `vercel` synced variable as a write-only sensitive variable, so a **Vercel Deployment Target** scope cannot include `development`, where sensitive variables are unavailable.
- insecur does not sync to Vercel `development`; local development values come from **Runtime Injection**, not synced provider variables.
- A `vercel` **Secret Sync Binding** stays a pure source **Secret** to provider variable-name mapping; the **Vercel Deployment Target** scope lives on the **Sync Target**, not the binding.
- A **Secret Sync** run creates one **Operation**.
- An **Operation** produces one or more **Audit Log** entries.
- An **Audit Export** contains one or more **Audit Log** entries.
- An **Organization Data Key** protects organization-owned sensitive data and is the baseline key boundary for **Sensitive Metadata**.
- A **Project Data Key** protects project secret data.
- **Key Rotation** creates or activates a new **Key Version**.
- The **Storage Security Gate** blocks production **Runtime Injection** and **Secret Sync** until tenant-bound encryption for **Secrets**, **Provider Credentials**, and **Sensitive Metadata** is implemented and verified.

## Example Dialogue

> **Dev:** "Can we use the same GitHub connection for every project?"
> **Domain expert:** "The **App Connection** belongs to the **Organization**, but each **Secret Sync** belongs to a **Project** and decides which **Environment** and **Sync Target** it writes to."
>
> **Dev:** "Can a provider callback just attach whatever GitHub installation or Vercel team came back from OAuth?"
> **Domain expert:** "No. A **Provider Authorization Callback** must verify **Provider Account Linkage**, bind to the intended **Organization** and **Connection Boundary**, and re-check the initiating **User's** **Organization Access** before storing credentials."
>
> **Dev:** "If I roll back a **Secret**, do we point reads at the old version?"
> **Domain expert:** "No. A **Rollback** creates a new **Secret Version** from the older value and makes that new version the **Current Version**."
>
> **Dev:** "Does setting a production secret immediately affect deploys?"
> **Domain expert:** "No. In a **Protected Environment**, setting creates a **Draft Version**; only **Promotion** creates a **Published Version** eligible for delivery."
>
> **Dev:** "Do we keep plaintext copies for emergency rollback?"
> **Domain expert:** "No. The **Rollback Retention Window** keeps encrypted prior **Published Versions** eligible for **Rollback**."
>
> **Dev:** "Can an agent pull production secrets to stdout?"
> **Domain expert:** "No. Prefer **Runtime Injection** for local commands and **Secret Sync** for provider destinations; **Secret Reveal** is a separate high-risk path."
>
> **Dev:** "Can an agent access the secret?"
> **Domain expert:** "Use **Secret Use** if the agent can trigger delivery, and **Secret Reveal** only if the agent receives the plaintext value."
>
> **Dev:** "Can dev inherit production defaults?"
> **Domain expert:** "Dev may copy the **Secret Shape**, but never the protected **Secret** value; use an **Environment Default** set specifically for dev."
>
> **Dev:** "What if one value really is shared across environments?"
> **Domain expert:** "Use a **Shared Secret Source** with explicit environment attachments, not environment inheritance or value copying."
>
> **Dev:** "Can the agent edit `.insecur.json` to change which command gets production secrets?"
> **Domain expert:** "No. `.insecur.json` is only a hint; a server-owned **Runtime Injection Policy** issues an **Injection Grant** only for an approved **Command Fingerprint**."
>
> **Dev:** "Can the system stop an approved child process from leaking its own environment?"
> **Domain expert:** "No. That is the **Runtime Trust Boundary**; the product minimizes accidental exposure before that point and audits delivery."
>
> **Dev:** "Where do webhooks live?"
> **Domain expert:** "Both layers. **Instance Configuration** can have instance-scoped **Webhook Subscriptions** for deployment-wide events like signup lockdown or instance health. **Organization Configuration** can have organization-scoped **Webhook Subscriptions** for tenant events like approvals, secret lifecycle changes, and sync completion."
>
> **Dev:** "How does the receiver verify a webhook?"
> **Domain expert:** "Each **Webhook Subscription** has a **Webhook Signing Secret**. Every **Event Notification** includes a timestamp and **Webhook Signature** produced with HMAC over the payload. The receiver verifies the signature before acting."
>
> **Dev:** "Do webhooks fire for every audit event?"
> **Domain expert:** "No. A **Webhook Subscription** includes selected **Webhook Event Types**. The subscriber chooses which events to receive when configuring the subscription. Anything webhook-worthy is still audited, but not every **Audit Log** entry generates an **Event Notification**."
>
> **Dev:** "Can a webhook include the approval note or provider target name?"
> **Domain expert:** "No. **Event Notifications** are metadata-safe tracking alerts. They exclude **Sensitive Values** and **Sensitive Metadata**, but can say that an approval completed or a sync finished successfully using opaque IDs, **Display Names**, stable event codes, and result status."
>
> **Dev:** "Can each organization bring its own SSO provider?"
> **Domain expert:** "Identity is **Instance Identity Configuration** today. **Users** authenticate to the **Instance**, then receive **Organization Access** through **Memberships**. **Organization**-scoped identity can be added later without moving secret governance out of **Organization Configuration**."
>
> **Dev:** "Why do we need memberships?"
> **Domain expert:** "Because login only answers who someone is. A **Membership** answers where they may act — which **Organization** or **Project** — and, for **Users** and **Teams**, which **Roles** apply there. It is the assignment record, not WorkOS org membership."
>
> **Dev:** "Do deploy keys get the admin role?"
> **Domain expert:** "No. **Environment Deploy Keys** get a tight **Token Scope** for one org/project/env and **Credential Scopes** such as `runtime.inject` only. The **Machine Identity** is the actor; the deploy key is an **Auth Method** for that actor."
>
> **Dev:** "Are roles just hard-coded strings?"
> **Domain expert:** "No. **Authorization Scopes** are the source of truth. V1 exposes **Built-In Roles** only: owner, admin, developer, approval, and read-only. Each **Built-In Role** is a preset **Authorization Scope** bundle, so custom **Roles** or explicit scope assignments can be added later without changing authorization checks."
>
> **Dev:** "Can I make a developer an approver without letting them edit project configuration?"
> **Domain expert:** "Yes. Assign the **Approval Role** separately from developer/admin. Behind the scenes, approval checks look for approval **Authorization Scopes** in **Effective Access**; the **Approval Role** contributes those scopes without contributing project configuration, **App Connection**, **Secret Sync** configuration, **Runtime Injection Policy**, or membership management scopes."
>
> **Dev:** "Does an owner also need the Approval Role?"
> **Domain expert:** "No. The owner **Built-In Role** includes approval **Authorization Scopes** so solo-owner operation works. Admin and developer do not include approval scopes; use the **Approval Role** when a non-owner should approve."
>
> **Dev:** "Can someone approve Project A without being able to approve Project B?"
> **Domain expert:** "Yes. Give them project-scoped approval **Authorization Scopes** for Project A. Approval checks evaluate **Effective Access** for the **Project** and **Protected Environment** affected by the **Approval Request**."
>
> **Dev:** "Can the requester approve their own production change?"
> **Domain expert:** "Only when the **Protected Approval Policy** requires one approval. The requester still needs approval **Authorization Scopes** and a **High-Assurance Challenge**. When the policy requires multiple approvals, **Requester Self-Approval** is denied."
>
> **Dev:** "Can one person count twice if they have approval through two Teams?"
> **Domain expert:** "No. Multi-approval policy counts **Distinct Approvers**. Teams and overlapping **Memberships** can grant approval scopes, but the approval actor is one concrete **User** and counts once."
>
> **Dev:** "Can an approver reject instead of approve?"
> **Domain expert:** "Yes. **Approval Request Rejection** uses the same approval **Authorization Scopes** and **High-Assurance Challenge** as approval. It closes the request without **Promotion** and leaves **Draft Versions** available for a later request."
>
> **Dev:** "Does rejection need a reason?"
> **Domain expert:** "No. V1 supports an optional **Approval Rejection Note**. It is **Sensitive Metadata**, handled like **Approval Context Note** text, and not required by the default **Protected Approval Policy**."
>
> **Dev:** "Can the requester cancel a pending approval request without MFA?"
> **Domain expert:** "Yes. **Approval Request Cancellation** only closes a pending request and cannot promote or expand delivery. The requester can cancel their own pending request with a normal authenticated session; scoped owners/admins can cancel pending requests for cleanup."
>
> **Dev:** "Can a request be canceled after one approver already approved it?"
> **Domain expert:** "Yes, while the **Approval Request** is still pending. **Partial Approvals** are tied to that exact request and **Promotion Change Set**; cancellation preserves them in audit history but they cannot be reused for any later request."
>
> **Dev:** "Can an Agent undo the Approval Request it created?"
> **Domain expert:** "Yes, when the request was created by a **Machine Identity** and is still pending. The same **Machine Identity** can perform **Approval Request Cancellation** with a currently valid machine credential and matching **Effective Access**, but it cannot cancel requests created by **Users** or other **Machine Identities**."
>
> **Dev:** "Can the Agent still cancel after a human already approved?"
> **Domain expert:** "Yes, while the request is still pending. A requesting **Machine Identity** can cancel its own pending **Approval Request** after human **Partial Approvals** exist; cancellation preserves those approvals in audit history, invalidates them for delivery and future requests, and does not satisfy the **Protected Approval Policy**."
>
> **Dev:** "Does the Agent need a stored user instruction before canceling?"
> **Domain expert:** "No. The current machine credential and matching **Effective Access** authorize own-request cancellation. If the cancellation came from a **User** instruction, task, or **Agent** run, record that correlation in audit history, but absence of that context does not block V1 cancellation."
>
> **Dev:** "Can an approval-only user cancel instead of rejecting?"
> **Domain expert:** "No. Approval **Authorization Scopes** authorize approval and **Approval Request Rejection**, not **Approval Request Cancellation**. Unless that **User** is the requester or has scoped owner/admin cleanup authority, they reject with a **High-Assurance Challenge**."
>
> **Dev:** "Can Okta group membership automatically make someone a production admin?"
> **Domain expert:** "Not by default. The **Human Identity Provider** decides who may authenticate; insecur decides **Organization Access** through **Teams**, **Memberships**, and **Roles**. Directory or SCIM sync may create **Teams** or **Memberships** later, but authorization still lives in insecur."
>
> **Dev:** "Who decides whether someone can log in?"
> **Domain expert:** "**Instance Identity Configuration** points at a **Human Identity Provider** such as WorkOS AuthKit or Okta. Admission is configured there. insecur creates or resolves a **User** from the **External Subject** on login, but **Organization Access** still comes from **Memberships**."
>
> **Dev:** "How does a self-hosted install get its first user and organization?"
> **Domain expert:** "Through **Instance Bootstrap** and **Bootstrap Operator Claim** completion. Bootstrap configures the **Human Identity Provider**, creates the **Instance**, **Instance Configuration**, first **Organization**, and a pending claim. The first **Instance Operator** is created only when a **Human Identity Provider**-authenticated **User** also presents the **Bootstrap Secret**."
>
> **Dev:** "Does self-hosting mean a different product or rewrite?"
> **Domain expert:** "No. A **Self-Hosted Instance** uses the same insecur runtime as a **Hosted Instance**, deployed into customer-controlled Cloudflare infrastructure. The customer holds **Instance Operator** and controls **Instance Configuration**."
>
> **Dev:** "Is hosted different from self-hosted in the product model?"
> **Domain expert:** "No. Both use the same **Instance** shape. On a **Hosted Instance**, customers mostly work at the **Organization** layer and **Instance Operator** defaults to insecur. On a **Self-Hosted Instance**, the customer holds **Instance Operator** and controls **Instance Configuration**."
>
> **Dev:** "Who configures rate limits on a self-hosted install?"
> **Domain expert:** "The **Instance Operator** through **Instance Configuration**. A **Self-Hosted Instance** is not capped by insecur rate-limit policy unless the customer chooses to configure limits."
>
> **Dev:** "Is that the same as Service Access?"
> **Domain expert:** "No. **Service Access** is insecur platform operations on a **Hosted Instance** — abuse response, investigation, signup lockdown. **Instance Operator** is customer-side administration of one **Instance**, including **Instance Configuration** and creating **Organizations** when **Public Onboarding** is off."
>
> **Dev:** "Can a self-hosted customer run more than one organization?"
> **Domain expert:** "Yes. A **Self-Hosted Instance** can contain one or many **Organizations**. Bootstrap creates the first one; the customer decides whether to add more."
>
> **Dev:** "Is self-hosting a different product?"
> **Domain expert:** "No. A **Self-Hosted Instance** is the same insecur installation model as a **Hosted Instance**. The customer operates the **Instance**; **Organizations** inside it still own the secrets boundary."
>
> **Dev:** "If public signups get abused, do we shut down existing tenants?"
> **Domain expert:** "No. Use **Signup Lockdown** to restrict **Public Onboarding** and unauthenticated **Invitation** acceptance while existing **Users** and **Organizations** continue through normal authentication and authorization."
>
> **Dev:** "If one organization is abusing sync jobs, do we delete it?"
> **Domain expert:** "No. Use **Tenant Suspension** to contain high-risk actions while preserving **Audit Log** evidence and a limited remediation path."
>
> **Dev:** "Can support inspect the secret to debug a failed sync?"
> **Domain expert:** "No. **Service Access** can decrypt **Sensitive Metadata** such as target names, but it must not reveal **Sensitive Values**."
>
> **Dev:** "Can break-glass show a production secret to an organization owner?"
> **Domain expert:** "No. If it is a **Protected Environment**, break-glass can recover service through **Secret Delivery**, replacement, reauthorization, or **Rollback**, but not **Secret Reveal**."
>
> **Dev:** "Can sync verification compare the provider's stored secret value against insecur?"
> **Domain expert:** "No. **Secret Sync** verification checks provider metadata and status only; it does not perform **Provider Readback**."
>
> **Dev:** "If sync planning already checked the provider target, can execution just decrypt and write later?"
> **Domain expert:** "No. Every **Secret Sync** run performs **Sync Execution Revalidation** immediately before decrypting **Sensitive Values**. **Provider Drift** returns `sync.provider_drift` and writes nothing."
>
> **Dev:** "If a provider secret already exists, can we import it?"
> **Domain expert:** "Only if the **Sensitive Value** enters through **Secret Import**. V1 does not read provider-side **Sensitive Values**. If the destination is already set, **Explicit Provider Lookup** produces a **Provider Overwrite Warning** for the exact **Secret Sync Binding**."
>
> **Dev:** "If a provider already has a value for a synced variable, do we preserve it?"
> **Domain expert:** "No. A **Secret Sync** is authoritative for exact **Secret Sync Bindings**. Once the **User** approves those bindings, sync performs **Provider Sync Overwrite** without reading the old provider-side value."
>
> **Dev:** "Can insecur list all provider variables so I can choose which ones to sync?"
> **Domain expert:** "No. That turns insecur into a provider inventory disclosure path. **Explicit Provider Lookup** only checks exact configured **Secret Sync Binding** destinations inside bounded setup, planning, or approval operations."
>
> **Dev:** "So when I configure a sync, can insecur check whether that exact provider variable already exists?"
> **Domain expert:** "Yes. **Explicit Provider Lookup** can check the exact **Secret Sync Binding** destination and produce a **Provider Overwrite Warning**. It still does not list nearby provider variables or read the existing provider-side **Sensitive Value**."
>
> **Dev:** "If the provider lookup is down during protected sync setup, can I approve anyway?"
> **Domain expert:** "No. **Protected Environment** setup, approval, enablement, and manual run fail closed with `provider.unavailable` until every exact **Secret Sync Binding** has a completed **Explicit Provider Lookup** status."
>
> **Dev:** "If the provider lookup is down during non-protected sync setup, does it also fail closed?"
> **Domain expert:** "No. Non-protected sync setup, enablement, and manual run may continue only after a user-visible warning, explicit confirmation for that operation, and an audit event. The **User** must see that overwrite status is unknown and a provider-side value may be replaced."
>
> **Dev:** "Can a generic yes-to-all confirmation acknowledge unknown provider overwrite?"
> **Domain expert:** "No. Generic confirmation, stored defaults, previous confirmation, or unrelated approval do not count. The confirmation must be for that operation."
>
> **Dev:** "If an exact provider lookup fails, can we show the provider's error message so the User knows why?"
> **Domain expert:** "No. Return a **Provider Lookup Status** such as `provider.lookup_not_found` or `provider.permission_denied`. Provider-native error text and raw provider bodies stay out of UI, CLI, logs, audit, and operation records."
>
> **Dev:** "Are provider variable names returned by exact lookup safe to log or index?"
> **Domain expert:** "No. Provider-side secret and variable names used by **Explicit Provider Lookup** are **Sensitive Metadata**. Show decrypted provider metadata only through authorized setup, plan, or approval views after **Sensitive Detail Gate**."
>
> **Dev:** "Can we keep a reveal command for emergencies but hide it behind a scary flag?"
> **Domain expert:** "No. **Misuse-Resistant Defaults** mean Protected Environment reveal paths are absent, not merely discouraged."
>
> **Dev:** "Can CI change the production runtime policy if it has a machine identity?"
> **Domain expert:** "No. A **Machine Identity** can use an exact pre-authorized policy, but protected policy changes require a **High-Assurance Challenge** from a **User**."
>
> **Dev:** "Can an agent create a production admin key without seeing it?"
> **Domain expert:** "Yes. Use a service-generated **Blind Secret Write** to create a **Draft Version**, then have the agent request **Promotion**. The **User** approves that request once."
>
> **Dev:** "After approval, do production provider secrets wait for another command?"
> **Domain expert:** "No. **Immediate Sync After Promotion** enqueues every enabled **Secret Sync** affected by any promoted version."
>
> **Dev:** "Can an agent ask to promote everything it staged?"
> **Domain expert:** "No. It must create a **Promotion Change Set** with exact **Draft Versions** in one **Protected Environment**."
>
> **Dev:** "Does an approval request expire if nobody reviews it quickly?"
> **Domain expert:** "No. An **Approval Request** does not expire by age in V1. It stays pending until it is approved, rejected, canceled, superseded by a newer request for the same **Protected Environment**, made policy-stale by a **Protected Approval Policy** change, made requester-access-stale by **Requester Access Staleness**, or closed because one of its **Draft Versions** was discarded."
>
> **Dev:** "If the agent keeps editing after asking for approval, should approval be blocked?"
> **Domain expert:** "No. Warn that newer **Draft Versions** exist. If those should go live too, request **Promotion** again, which performs **Approval Request Supersession** for the prior pending request in that **Protected Environment**."
>
> **Dev:** "Does approval freeze the sync destinations the human saw?"
> **Domain expert:** "No. The **Promotion Change Set** freezes only **Draft Version** identity. The **Approval Impact Review** must be recomputed before approval, and stale approval screens require fresh review."
>
> **Dev:** "After approval, how do we know what delivery impact the approver acted on?"
> **Domain expert:** "Persist an **Approval Impact Snapshot** from the accepted **Approval Impact Review** that caused **Promotion**. For rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed requests, show immutable request facts and optionally a clearly labeled **Current Impact Preview**, but do not treat recomputed impact as historical approval evidence."
>
> **Dev:** "If sync impact changes after the first of two approvals, does the first approval still count?"
> **Domain expert:** "No. A **Partial Approval** records the **Approval Impact Review Fingerprint** it approved. If the current impact fingerprint changes before the **Protected Approval Policy** is satisfied, old **Partial Approvals** stay in audit history but become audit-only and must be re-collected against the fresh **Approval Impact Review**."
>
> **Dev:** "If an approver loses access after giving the first approval, does that approval still count?"
> **Domain expert:** "No. Before a **Partial Approval** counts toward the threshold, **Approver Access Revalidation** confirms the approving **User** is still active and currently has approval **Authorization Scopes** for the affected **Project** and **Protected Environment**. If not, the **Partial Approval** stays in audit history but becomes audit-only."
>
> **Dev:** "If that approver gets access back before approval finishes, does the old approval count again?"
> **Domain expert:** "No. Once failed **Approver Access Revalidation** makes a **Partial Approval** audit-only, that record stays audit-only. The **User** can approve again only with current **Effective Access**, a fresh **Approval Impact Review**, and a new **High-Assurance Challenge**."
>
> **Dev:** "If the requester loses access while the approval request is pending, can approvers still approve it?"
> **Domain expert:** "No. **Requester Access Staleness** closes the pending **Approval Request** without **Promotion**. Existing **Partial Approvals** become audit-only, **Draft Versions** stay in the **Draft Area**, and a currently authorized **User** or **Machine Identity** can create a fresh **Approval Request** if the change is still wanted."
>
> **Dev:** "If the agent's short-lived token expires while its approval request is pending, does the request become stale?"
> **Domain expert:** "No. Short-lived machine credential expiry alone does not cause **Requester Access Staleness**. For a **Machine Identity** request, staleness comes from durable authority changes such as disabled **Machine Identity**, removed **Membership** or approval-relevant **Authorization Scopes**, **Tenant Suspension**, or revoked/disabled **Auth Method**."
>
> **Dev:** "If the deploy key rotates while the agent's approval request is pending, does the request become stale?"
> **Domain expert:** "No, not for normal **Environment Deploy Key** rotation that preserves the same active **Auth Method**. **Requester Access Staleness** applies only when rotation is a compromise response that revokes, disables, or marks untrusted the **Auth Method** used for that pending request."
>
> **Dev:** "If the requester regains access after requester-access staleness, does the old request become approvable again?"
> **Domain expert:** "No. **Requester Access Staleness** is terminal for that **Approval Request**. The requester can create a fresh **Approval Request** with current authority and a fresh **Approval Impact Review**, but the stale request remains audit-only."
>
> **Dev:** "If the organization is suspended while approvals are pending, do they resume after reinstatement?"
> **Domain expert:** "No. **Tenant Suspension** performs **Requester Access Staleness** for pending **Approval Requests** in that **Organization**. Existing **Partial Approvals** become audit-only, **Draft Versions** stay in the **Draft Area**, and fresh **Approval Requests** are required after reinstatement."
>
> **Dev:** "If the project or protected environment is archived while approval is pending, can the old request be approved later?"
> **Domain expert:** "No. If the affected **Project** or **Protected Environment** no longer accepts protected **Promotion**, the pending **Approval Request** closes without **Promotion**. It preserves audit history, existing **Partial Approvals** become audit-only, and restoration or recreation requires a fresh **Approval Request**."
>
> **Dev:** "Can a fresh approval request reuse the same staged secret versions?"
> **Domain expert:** "Yes, use **Draft Version Reuse** when the **Draft Versions** still exist in the **Draft Area** and the target still accepts protected **Promotion**. The fresh request gets a new **Promotion Change Set**, new **Approval Impact Review**, and fresh approvals; the old request and **Partial Approvals** stay audit-only."
>
> **Dev:** "Can I clean up a staged secret version that will never be promoted?"
> **Domain expert:** "Yes. Use **Draft Version Discard**. The requester can discard their own unpromoted **Draft Version**, and scoped owner/admin users can discard for cleanup. It is audited, reveals no **Sensitive Values**, does not require approval, and any pending **Approval Request** containing that **Draft Version** closes without **Promotion**."
>
> **Dev:** "Can I undo a draft discard if I made a mistake?"
> **Domain expert:** "No. **Draft Version Discard** is terminal for that **Draft Version**. If the same **Sensitive Value** is still wanted, create a new **Blind Secret Write** and a new **Draft Version**, then request **Promotion** again if the target is protected."
>
> **Dev:** "Do we keep the discarded draft's encrypted value for retention?"
> **Domain expert:** "No. V1 **Draft Version Discard** crypto-erases the encrypted **Sensitive Value** material immediately and keeps only tombstone/audit metadata. Closed approval views can show immutable metadata, but the discarded value cannot be recovered."
>
> **Dev:** "Does discarding a draft need MFA or approval?"
> **Domain expert:** "No. It needs **Destructive Confirmation**, not a **High-Assurance Challenge** or **Approval Request**. Human UI and CLI flows require explicit discard confirmation; API and **Machine Identity** flows must name exact **Draft Version** IDs and are idempotent."
>
> **Dev:** "If discarding a draft closes a pending approval request, should the confirmation say that?"
> **Domain expert:** "Yes. Human **Destructive Confirmation** shows metadata-only impact: exact **Draft Version** IDs, affected **Approval Request** IDs, that **Partial Approvals** become audit-only, and that encrypted **Sensitive Value** material will be crypto-erased. It must not show **Sensitive Values** or decrypted **Sensitive Metadata**."
>
> **Dev:** "If I confirm discard, can the server still execute later after the pending request set changes?"
> **Domain expert:** "No. The service binds **Destructive Confirmation** to the computed metadata-only **Draft Version Discard** impact and revalidates immediately before execution. If a selected **Draft Version** was promoted, already discarded, removed from the actor's scope, or affects a different pending **Approval Request** set, UI/CLI must show refreshed impact and require fresh confirmation."
>
> **Dev:** "If approval policy changes while a request is pending, does the request use the old or new policy?"
> **Domain expert:** "Neither. **Approval Policy Staleness** closes the pending request without **Promotion**. Existing **Partial Approvals** become audit-only, **Draft Versions** stay in the **Draft Area**, and the requester creates a fresh **Approval Request** under the new **Protected Approval Policy**."
>
> **Dev:** "Does changing the approval policy create its own approval request?"
> **Domain expert:** "Not in V1. A **Protected Approval Policy Change** is a high-assurance configuration mutation that requires owner/admin configuration **Authorization Scopes** and a **High-Assurance Challenge**. It is audited heavily and makes affected pending requests policy-stale; future enterprise support may add a separate approval purpose for policy changes."
>
> **Dev:** "Can the agent explain why it is asking for approval?"
> **Domain expert:** "Yes, as an **Approval Context Note**. It is useful context, but the approval source of truth is still the server-generated **Promotion Change Set** and **Approval Impact Review**."
>
> **Dev:** "Can approval notes be stored like ordinary comments?"
> **Domain expert:** "No. **Approval Context Notes** are **Sensitive Metadata** because they can reveal production plans, incidents, architecture, and provider targets."
>
> **Dev:** "Can approval emails include the agent's context note?"
> **Domain expert:** "No. **Approval Notifications** use low-privilege metadata and link to the authenticated approval view. They do not include **Approval Context Note** plaintext."
>
> **Dev:** "Can I approve directly from email or a push notification?"
> **Domain expert:** "No. **Approval Notifications** may deep-link to the authenticated approval view, but approval happens only after normal authorization and a **High-Assurance Challenge**."
>
> **Dev:** "What happens if I open an approval notification after the request was canceled or superseded?"
> **Domain expert:** "It opens the authenticated approval view in a closed or stale state. The view must not offer approval, rejection, cancellation, **Promotion**, or delivery-changing actions for that **Approval Request**."
>
> **Dev:** "Can I still inspect what the old approval request contained?"
> **Domain expert:** "Yes, if you are currently authorized. A closed or stale approval view may show immutable request facts such as the **Promotion Change Set**, exact **Draft Version** IDs, status, actors, timestamps, and **Partial Approvals**. **Approval Context Notes** and **Approval Rejection Notes** still require **Sensitive Detail Gate**."
>
> **Dev:** "Can push notifications be the main way I find out about production approvals?"
> **Domain expert:** "Yes. Browser/mobile push is the **Primary Approval Notification Channel** when a **Push Device Registration** exists, but it only opens the authenticated approval view."
>
> **Dev:** "Can a push notification say which production environment or secret needs approval?"
> **Domain expert:** "No. Push **Approval Notifications** are lock-screen safe and generic. The authenticated approval view may show **Display Names** after authorization, but fetches decrypted **Sensitive Metadata** only after a **Sensitive Detail Gate**."
>
> **Dev:** "If a normal browser session is hijacked, can the attacker open the approval view and read sensitive details?"
> **Domain expert:** "No. A normal session can see low-detail pending state, but decrypted **Sensitive Metadata** requires a **Sensitive Detail Gate**."
>
> **Dev:** "Do normal product names need a Sensitive Detail Gate?"
> **Domain expert:** "No. User-authored names are normal **Display Names** shown after authentication and authorization."
>
> **Dev:** "Can a signed-in browser add or replace a push device silently?"
> **Domain expert:** "No. Creating or replacing a **Push Device Registration** requires a **High-Assurance Challenge** because it changes where approval activity can be observed."
>
> **Dev:** "Should an agent be able to create several pending production approval requests?"
> **Domain expert:** "No. One **Protected Environment** has one pending promotion **Approval Request**. Newer requests supersede older ones and notifications coalesce around the latest request."
>
> **Dev:** "Can one approval both promote values and enable a new production sync destination?"
> **Domain expert:** "No. V1 **Approval Requests** have one approval purpose. **Promotion** and **Protected Delivery Configuration Changes** require separate approvals."
>
> **Dev:** "Does a production sync mean every variable in the environment goes to the provider?"
> **Domain expert:** "No. A **Secret Sync** has exact **Secret Sync Bindings** for the variables selected for that destination."
>
> **Dev:** "If I remove a variable from a sync, should the provider copy remain?"
> **Domain expert:** "No. Removing a **Secret Sync Binding** creates a **Managed Provider Delete** for the provider-side copy that binding managed. Disabling the sync is different and leaves existing provider copies in place with a warning."
>
> **Dev:** "What happens if I delete the whole sync?"
> **Domain expert:** "That is **Secret Sync Deletion**. It removes all **Secret Sync Bindings**, creates **Managed Provider Deletes** for their provider-side copies, and tombstones the sync for audit. Use **Secret Sync Disable** when you only want to pause writes."
>
> **Dev:** "What if provider cleanup fails while deleting a sync?"
> **Domain expert:** "Tombstone the sync, alert the **User**, and preserve **Orphaned Managed Provider Copy** metadata for retry cleanup. Treat it as a warning, not a critical platform failure."

## Flagged Ambiguities

- "account" is ambiguous between **User** and **Organization**; use the precise term.
- "tenant" should be written as **Organization** unless discussing multi-tenancy as a general property or the whole product install, when **Instance** may be meant.
- "self-hosted" should be written as **Self-Hosted Instance** when the deployment boundary is meant, not a separate product edition.
- "SaaS" should be written as **Hosted Instance** when the insecur-operated deployment boundary is meant.
- "SSO" at deployment scope should be written as **Instance Identity Configuration** unless per-**Organization** IdP is explicitly in scope.
- "SSO group" should not imply **Organization Access** unless a future directory sync has created a **Team** or **Membership** in insecur.
- "provisioned user" should not imply **Organization Access**; authentication alone only resolves a **User** bound to an **External Subject**.
- "webhook payload" should be written as **Event Notification** when referring to the delivered message.
- "webhook" should be written as **Webhook Subscription** when referring to the configured outbound integration, not the destination URL alone.
- "organization settings" should be written as **Organization Configuration** when the configured object is meant.
- "signup" is ambiguous between **User** creation, **Organization** creation, and the full **Public Onboarding** flow; use the precise term.
- "invite" should be written as **Invitation** when referring to pending membership acceptance.
- "ban" and "disable tenant" should be written as **Tenant Suspension** when the organization still exists for evidence and remediation.
- "support access" and "operator access" should be written as **Service Access** when the action operates insecur across organizations.
- "operator" is ambiguous between **Instance Operator** and **Service Access**; use the precise term.
- "admin" is ambiguous between **Role**, **Instance Operator**, and **Service Access**; use the precise term.
- "scope" is ambiguous between **Authorization Scope**, **Credential Scopes**, and **Token Scope**; use the precise term.
- "permission" should be written as **Authorization Scope** when referring to atomic organization or project capability, and **Role** when referring to the named bundle assigned through **Membership**.
- "rule" should be written as **Role** when referring to an access bundle, or **Authorization Scope** when referring to an atomic capability.
- "machine role" should not be used; **Machine Identities** receive explicit **Authorization Scopes** through project-scoped **Memberships**, and machine credentials receive **Credential Scopes**.
- "deploy key membership" should be written as **Machine Identity** project **Membership** plus **Environment Deploy Key** **Credential Scopes** when deploy automation access is meant.
- "group" should be written as **Team** when a reusable collection of **Users** may share **Memberships** and **Roles**.
- "rate limits" at deployment scope should be written as **Instance Configuration** on an **Instance**, not organization quota unless the limit applies to one **Organization** only.
- "user access" is ambiguous between **Organization Access** and **Service Access**; use the precise term.
- "credential" is overloaded; use **Auth Method**, **Machine Token**, **Connection Method**, or **App Connection** depending on the boundary.
- "CLI token" should be written as **Ephemeral CLI Credential** when it is memory/session-only.
- "deploy key" should be written as **Environment Deploy Key** when it is scoped to one project environment.
- "deploy key for sync" is incorrect; **Secret Sync** uses an **App Connection**, not an **Environment Deploy Key**.
- "sync the environment" should be written as **Secret Sync** with exact **Secret Sync Bindings**.
- "overwrite provider secret" should be written as **Provider Sync Overwrite** when a **Secret Sync** replaces a bound provider-side value.
- "already set in the provider" should be written as **Provider Overwrite Warning** when an exact **Secret Sync Binding** destination exists before sync.
- "provider changed under us" should be written as **Provider Drift** when current provider state no longer matches authorized configuration.
- "preflight check" should be written as **Sync Execution Revalidation** when the check gates decrypt and provider writes.
- "remove from sync" should be written as removing a **Secret Sync Binding**, which creates a **Managed Provider Delete** for its managed provider-side copy.
- "pause sync" should be written as **Secret Sync Disable**.
- "delete sync" should be written as **Secret Sync Deletion** when provider-side managed copies will be deleted.
- "failed provider cleanup" should be written as **Orphaned Managed Provider Copy** when a managed provider-side copy may still exist.
- "deploy key access" should be described as allowlisted **Runtime Policy Key** attachment, not direct secret access.
- "deploy key expiration" should be written as **Deploy Key Rotation Policy** when expiration and rotation are configurable.
- "policy key" should be written as **Runtime Policy Key** when it selects one runtime injection policy.
- "policy version" should be written as **Runtime Injection Policy Version** when it refers to runtime authorization state.
- "edit policy" means create a new **Runtime Injection Policy Version** and update the active version pointer.
- "secret filter" should not be used for **Runtime Injection Policy**; use exact secret bindings.
- "wildcard" and "pattern" are invalid for **Runtime Injection Policy** secret selection.
- "command log" should be written as **Command Output Boundary** when deciding whether stdout/stderr can be captured.
- "API key" is ambiguous; use **Scoped Provider Token** for manually created provider tokens and deployment secret for insecur's own platform/provider keys.
- "blast radius" should be written as **Connection Boundary** when referring to app connection resource limits.
- "connected provider account" should be written as **Provider Account Linkage** when cross-tenant linking is the risk.
- "OAuth callback" should be written as **Provider Authorization Callback** when the flow can create or update an **App Connection**.
- "integration" is ambiguous between **App Connection** and **Secret Sync**; use **App Connection** for provider authorization and **Secret Sync** for project-level push behavior.
- "environment" is ambiguous between insecur **Environment** and GitHub Environment; qualify the provider term as GitHub Environment.
- "protected GitHub environment" is ambiguous; use **GitHub Environment Protection** when the provider-side rules are the security gate.
- "repo secret" is ambiguous; use GitHub repository secret when referring to repository-wide provider scope, and project-specific Secret Sync when referring to insecur's Project boundary.
- "sync import" is ambiguous and unsafe; use **Secret Import** for a value entering insecur and **Secret Sync** for a value leaving insecur.
- "provider probe" should not be used; **Explicit Provider Lookup** is not a standalone UI, API, or CLI command in V1.
- "provider error message" should be written as **Provider Lookup Status** for **Explicit Provider Lookup** failures; raw provider text is not product output.
- "orphan value" should be written as **Orphaned Managed Provider Copy** when provider cleanup may have failed; it is not a stored insecur **Sensitive Value**.
- "verify sync" should not imply **Provider Readback**; verification checks provider metadata and status.
- "latest" can mean newest by creation time or selected for reads; use **Current Version** when referring to the served value.
- "published" should be written as **Published Version** when referring to protected delivery eligibility.
- "draft" should be written as **Draft Version** when referring to an unpromoted stored value.
- "staging area" should be written as **Draft Area** when referring to unpromoted **Draft Versions** in one **Protected Environment**.
- "delete draft secret" should be written as **Draft Version Discard** when removing an unpromoted **Draft Version** from the **Draft Area** without revealing its **Sensitive Value**.
- "restore discarded draft" should not be used; a discarded **Draft Version** is terminal, and the same wanted value requires a new **Blind Secret Write** and **Draft Version**.
- "retain discarded draft value" should not be used; V1 **Draft Version Discard** crypto-erases encrypted **Sensitive Value** material immediately and retains tombstone/audit metadata only.
- "approve discard" should not be used; **Draft Version Discard** requires **Destructive Confirmation**, not an **Approval Request** or **High-Assurance Challenge**.
- "discard without impact" should not be used for human flows; **Draft Version Discard** **Destructive Confirmation** shows metadata-only impact before execution.
- "stale discard confirmation" should not execute; human **Draft Version Discard** requires refreshed metadata-only impact and fresh **Destructive Confirmation** when impact or access changes.
- "reuse approval" should not be used for **Draft Version Reuse**; only the unpromoted **Draft Versions** can be selected again, not approval evidence or request state.
- "discard approval" should not be used; discarding a **Draft Version** closes affected pending **Approval Requests** without approving or rejecting them.
- "promote all" and "all staged changes" should be written as an explicit **Promotion Change Set** with exact **Draft Versions**.
- "overwrite approval request" should be written as **Approval Request Supersession**; the old request is marked superseded, not mutated in place.
- "deny approval" should be written as **Approval Request Rejection** when referring to a human review outcome, and authorization denial when referring to access failure.
- "cancel approval" should be written as **Approval Request Cancellation** when the requesting **User**, requesting **Machine Identity**, or scoped admin closes a pending request without review.
- "approver cancellation" should be written as **Approval Request Rejection** unless the actor is also the requester or a scoped owner/admin cleanup actor.
- "agent undo" should be written as **Approval Request Cancellation** when the same requesting **Machine Identity** withdraws its own pending request.
- "user-approved agent cancel" should not be used for V1 authorization; record user/task/run correlation in audit when available, but authorize by machine credential and **Effective Access**.
- "pre-approval" should be written as **Partial Approval** only when referring to an approval recorded on a still-pending **Approval Request**.
- "carry over approval" should not be used; **Partial Approvals** are request-bound and cannot be reused.
- "revoked approval" should be written as audit-only **Partial Approval** after failed **Approver Access Revalidation** when the approval record remains in history.
- "restored approval" should not be used; if failed **Approver Access Revalidation** made a **Partial Approval** audit-only, the **User** must approve again after regaining access.
- "approval policy approval" should be written as **Protected Approval Policy Change** in V1 unless a future separate approval purpose exists.
- "policy changed approval" should be written as **Approval Policy Staleness** when a pending request is closed because its **Protected Approval Policy** changed.
- "requester lost access" should be written as **Requester Access Staleness** when a pending **Approval Request** is closed because its requesting **User** or **Machine Identity** no longer has authority.
- "expired agent token" should not be written as **Requester Access Staleness** unless the **Machine Identity** or the request's **Auth Method** also lost durable authority.
- "rotated deploy key" should not be written as **Requester Access Staleness** unless rotation revoked, disabled, or marked untrusted the **Auth Method** used for the pending **Approval Request**.
- "restored request" should not be used; a requester-access-stale **Approval Request** stays audit-only even if the requester regains access.
- "paused approval during suspension" should not be used; **Tenant Suspension** performs **Requester Access Staleness** for pending **Approval Requests**.
- "restore approval after archive" should not be used; target lifecycle changes that stop protected **Promotion** close pending **Approval Requests** terminally.
- "rejection reason" should be written as **Approval Rejection Note** when referring to optional user-authored rejection text, and denial reason when referring to authorization failure metadata.
- "approval diff" should be written as **Approval Impact Review** when referring to metadata-only delivery and sync impact.
- "impact hash" should be written as **Approval Impact Review Fingerprint** when referring to the metadata-only binding between a review and approval.
- "approved impact" should be written as **Approval Impact Snapshot** when referring to the persisted delivery and sync impact evidence used for the final approval decision.
- "current impact" should be written as **Current Impact Preview** when referring to a recomputed, non-authoritative investigation view on a closed or stale request.
- "agent summary" should be written as **Approval Context Note** when it is requester-supplied explanatory text on an **Approval Request**.
- "approval comment" should be written as **Approval Context Note** when the text explains a protected approval request.
- "approval email" and "approval ping" should be written as **Approval Notification** when referring to out-of-band alerts.
- "push approval details" should not be used; push **Approval Notifications** carry generic preview-safe alerts, not approval details.
- "approval link" should be written as an **Approval Notification** deep link when it opens the authenticated approval view, and must not imply a bearer approval action.
- "stale approval link" should be written as an **Approval Notification** deep link resolving to closed or stale approval view state.
- "view sensitive details" should be written as satisfying the **Sensitive Detail Gate** when decrypted **Sensitive Metadata** is displayed.
- "secret name", "environment name", and "project name" should be written as **Display Name** when they are user-authored product labels.
- "email approval" should not be used; approval happens in the authenticated approval view, not in email.
- "push token" should be written as **Push Device Registration** when ownership, revocation, or notification delivery is the boundary.
- "primary approval path" should be written as **Primary Approval Notification Channel** only when referring to notification preference, not approval authority.
- "approval source of truth" should refer to server-generated **Promotion Change Set** and **Approval Impact Review** facts for pending approval, and **Approval Impact Snapshot** for historical final approval evidence, not an **Approval Context Note**.
- "approve and enable sync" should be split into **Promotion** and a separate **Protected Delivery Configuration Change**.
- "blind secret" should be written as **Blind Secret Write** when the write flow is meant; a blind write still creates a normal **Secret Version**.
- "stage a secret" should be written as **Blind Secret Write** when a value is being written without reveal, or **Draft Version** when the stored version is meant.
- "go live" should be written as **Promotion** for a **Protected Environment** and **Current Version** selection for a non-protected **Environment**.
- "two-person approval" should be written as **Protected Approval Policy** when approval count is configurable.
- "schedule sync" should be deferred language for v1; use **Immediate Sync After Promotion** for approved protected changes.
- "backup copy" should be written as **Rollback Retention Window** when referring to encrypted prior version retention for rollback.
- "single source of truth" should be written as **Secret Source of Truth** when referring to insecur's canonical value for sync and delivery.
- "profile" is ambiguous; use **CLI Profile** for named local command/deploy context.
- "storage is ready" should be written as **Storage Security Gate** when referring to the required tenant-bound encryption baseline for **Secrets**, **Provider Credentials**, and **Sensitive Metadata**.
- "encrypted at rest" is too weak when discussing storage invariants; use **No Plaintext Persistence**.
- "redact secrets" is too weak when discussing observability invariants; use **Secret-Free Logging**.
- "metadata-only" does not mean broadly safe; use **Sensitive Metadata** when names, targets, or relationships can expose security-relevant structure.
- "provider variable name" or "provider secret name" used by **Explicit Provider Lookup** or **Secret Sync Binding** should be written as **Sensitive Metadata**.
- "metadata encryption" should be written as **Sensitive Metadata Encryption** when referring to security-relevant names, targets, or relationships.
- "slug" should not be used for durable server-side selectors; use **Opaque Resource ID**.
- "search" should not be used for v1 Sensitive Metadata discovery; use **Scoped List** or **Configured Selector**.
- "name" is ambiguous; use **Display Name** for user-authored product labels and **Sensitive Metadata** for provider-side names, targets, notes, device routing, or security-relevant relationships.
- "pass the secret" is ambiguous; use **Safe Sensitive Input Path** when describing how values enter the system.
- "value flag" is unsafe for **Sensitive Values**; use stdin, a masked prompt, request body, or provider authorization flow.
- "idiot-proof" should be written as **Misuse-Resistant Defaults** when referring to product behavior that prevents accidental unsafe actions.
- "MFA required" should be written as **High-Assurance Challenge** when referring to a fresh verification gate for a high-risk action.
- "actual secret" should be written as **Sensitive Value** when referring to protected plaintext beyond managed **Secret** values.
- "plaintext access" is ambiguous between **Secret Delivery** and **Secret Reveal**; use **Secret Reveal** only when the caller receives the plaintext value.
- "keys" is ambiguous between **Secrets** and encryption keys; use **Secret** for application values and **Organization Data Key** or **Project Data Key** for encryption material.
- "access to secrets" is ambiguous between **Secret Use** and **Secret Reveal**; use **Secret Use** when the actor can trigger delivery but cannot receive the value.
- "production secret" should be written as **Protected Environment** **Secret** when discussing reveal and delivery policy.
- "default production variable" is unsafe language; use **Secret Shape** for shared metadata and **Environment Default** for a non-protected environment value.
- "shared secret" should mean **Shared Secret Source**, not environment inheritance or a copied value.
- "run policy" should be written as **Runtime Injection Policy** when it authorizes secret delivery.
- "wrapper" is ambiguous; use **Runtime Injection** for the delivery behavior, and say separate helper process only when a distinct local process is meant.
- "sandbox" should not be used for **Runtime Injection** unless the child process is actually isolated from its own environment and outputs.
- "rapidly changing env var" is usually not **Startup Configuration**; use a future dynamic secret or configuration mechanism instead of repeated **Promotion** requests.
