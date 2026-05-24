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
An Instance operated by the customer in infrastructure the customer controls.
_Avoid_: on-prem when a customer-operated cloud deployment is meant

**Organization**:
The tenant boundary that owns projects, memberships, machine identities, app connections, and audit log entries inside one Instance.
_Avoid_: account, workspace, tenant when "organization" is meant, instance when the deployment boundary is meant

**User**:
A human actor who can receive access through memberships.
_Avoid_: account, member when referring to the person

**Organization Access**:
Access granted inside an organization or project through a membership and role.
_Avoid_: service access when the action is customer-scoped

**Service Access**:
Access granted to a user or machine identity to operate insecur across organizations for support, abuse response, incident investigation, and reliability.
_Avoid_: operator access, support access, platform user

**Public Onboarding**:
The externally available flow where a user can enter insecur and create or join organizations.
_Avoid_: signup when the user and organization boundaries matter

**Signup Lockdown**:
A security state that restricts public onboarding while existing organizations continue normal authenticated access.
_Avoid_: maintenance mode, invite pause

**Tenant Suspension**:
A security state that restricts an organization's high-risk actions while preserving evidence and limited owner remediation access.
_Avoid_: deletion, ban when the organization still exists

**Invitation**:
A pending request for a user to receive a membership in an organization or project.
_Avoid_: signup link when membership is the target

**Agent**:
An automated tool that acts through a user or machine identity.
_Avoid_: bot user, script when the authentication boundary is meant

**Membership**:
An association between an actor and an organization or project scope.
_Avoid_: permission, grant

**Role**:
A named permission set assigned through a membership.
_Avoid_: permission when referring to the named set

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

**Published Version**:
The secret version selected for delivery from a protected environment.
_Avoid_: current when protected delivery status is meant

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

**Approval Impact Review**:
A metadata-only view of the current Secret Delivery and Secret Sync impact of an Approval Request.
_Avoid_: diff when implying Sensitive Values are compared

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

**Connection Boundary**:
The provider resources an app connection is allowed to reach.
_Avoid_: blast radius when referring to the configured boundary

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
Provider-side protection rules on a GitHub Environment that make it acceptable for protected production secret sync.
_Avoid_: environment exists when protection is meant

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
- A **Hosted Instance** and a **Self-Hosted Instance** use the same product capabilities; they differ only in who operates the Instance and its onboarding posture.
- An **Organization** belongs to exactly one **Instance**.
- An **Organization** owns zero or more **Projects**.
- An **Organization** owns zero or more **Machine Identities**.
- An **Organization** owns zero or more **App Connections**.
- An **Organization** owns **Audit Log** entries for actions within its boundary.
- A **User** can have **Memberships** in many **Organizations** and **Projects**.
- A **User** or **Machine Identity** receives **Organization Access** through **Memberships**.
- A **User** or **Machine Identity** may receive **Service Access** outside any customer **Organization**.
- **Public Onboarding** can create a **User** and may create an **Organization**.
- An **Invitation** can create a **Membership** for an existing **User**.
- An **Invitation** can create a **User** only through **Public Onboarding**.
- **Signup Lockdown** restricts **Public Onboarding**, new **User** creation, new **Organization** creation, and unauthenticated **Invitation** acceptance.
- **Signup Lockdown** does not restrict existing **User** login or existing **Membership** use.
- **Tenant Suspension** applies to one **Organization**.
- **Tenant Suspension** restricts high-risk **Secret Egress**, **Secret Sync**, **Runtime Injection**, **App Connection**, **Invitation**, and **Machine Identity** actions.
- **Tenant Suspension** preserves **Audit Log** history and limited owner remediation access.
- **Service Access** can include decrypted **Sensitive Metadata**.
- **Service Access** excludes **Secret Reveal**, **Secret Delivery**, and **Sensitive Values**.
- An **Agent** acts through one **Actor** at a time.
- A **Machine Identity** can have **Memberships** in its owning **Organization** and its **Projects**.
- A **Membership** links one **Actor** to one **Organization** or **Project** scope.
- A **Membership** carries one or more **Roles**.
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
- A **Blind Secret Write** in a non-protected **Environment** may update the **Current Version** immediately.
- A **Protected Environment** has one **Protected Approval Policy**.
- A **Protected Approval Policy** may require one or more approving **Users**.
- Requesting **Promotion** in a **Protected Environment** creates a **Promotion Change Set** and an **Approval Request**.
- A **Promotion Change Set** belongs to one **Protected Environment**.
- A **Promotion Change Set** contains one or more exact **Draft Versions**.
- A **Promotion Change Set** cannot use wildcards or "all staged" selection.
- A **Promotion Change Set** is immutable after the **Approval Request** is created.
- **Draft Versions** created after an **Approval Request** are outside that request's **Promotion Change Set**.
- An **Approval Request** does not expire by age in V1.
- An **Approval Request** remains pending until approved, explicitly canceled, or superseded.
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
- Email **Approval Notifications** must not contain approve, deny, or other approval action links.
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
- A superseded **Approval Request** cannot be approved.
- A superseded **Approval Request** remains in the audit trail.
- Approval screens warn, but do not block, when newer **Draft Versions** exist outside the request's **Promotion Change Set**.
- The newer-draft warning should encourage the requester to request **Promotion** again if those **Draft Versions** should be included.
- A **Promotion Change Set** freezes **Draft Version** identity only.
- A **Promotion Change Set** does not freeze **Secret Sync**, **Runtime Injection Policy**, **App Connection**, or other delivery target configuration.
- An **Approval Impact Review** is recomputed before **Approval Request** approval.
- An **Approval Impact Review** contains metadata only and excludes **Sensitive Values**.
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
- An **Approval Request** approval can perform **Promotion** of its **Promotion Change Set** when the **Protected Approval Policy** is satisfied.
- A **Machine Identity** cannot approve an **Approval Request**.
- **Service Access** cannot approve customer **Approval Requests**.
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
- A **High-Assurance Challenge** gates **Sensitive Detail Gate**, protected **Approval Request** approval, protected **Promotion**, protected **Rollback**, protected **Secret Import**, protected **Secret Sync** enable/run, protected **Runtime Injection Policy** changes, protected **App Connection** changes, protected **Shared Secret Source** attachment, **Push Device Registration** creation/replacement, and mutating **Service Access** controls.
- A **Machine Identity** cannot satisfy a **High-Assurance Challenge**.
- A **Machine Identity** may create **Blind Secret Writes** and request **Promotion** if **Organization Access** allows it.
- A **Machine Identity** may use exact policies or operations previously authorized by a **User** through a **High-Assurance Challenge**.
- A **Machine Identity** proves itself through an **Auth Method**.
- A **Machine Identity** may use an **Environment Deploy Key** as an **Auth Method**.
- A **Machine Token** is constrained by a **Token Scope**.
- An **Ephemeral CLI Credential** belongs to one CLI session and is not persisted to disk.
- An **Environment Deploy Key** can exchange for short-lived access within one **Environment**.
- An **Environment Deploy Key** has one **Deploy Key Rotation Policy**.
- An **Environment Deploy Key** can authorize only allowlisted **Runtime Policy Keys**, not arbitrary **Runtime Injection**.
- An **Environment Deploy Key** cannot choose its own secret set, command shape, or **Command Fingerprint**.
- An **Environment Deploy Key** can authorize **Runtime Injection**, not **Secret Sync**.
- Exact **Runtime Injection Policy** bindings support **Forensic Traceability**.
- An **App Connection** uses one **Connection Method**.
- An **App Connection** may store one or more **Provider Credentials**.
- An **App Connection** has one **Connection Boundary**.
- An **App Connection** has one verified **Provider Account Linkage**.
- A **Provider Authorization Callback** can create or replace **Provider Credentials** only for one pending **App Connection** operation.
- A **Provider Authorization Callback** is bound to exactly one **Organization**, initiating **User**, pending **App Connection** or reauthorization operation, **Connection Method**, and intended **Connection Boundary**.
- A **Provider Authorization Callback** must re-check the initiating **User's** **Organization Access** before persisting **Provider Credentials** or changing **Provider Account Linkage**.
- A **Provider Authorization Callback** must verify the external provider account, installation, team, repository, project, worker, or resource identity before persisting **Provider Account Linkage**.
- A **Provider Authorization Callback** must not allow one **Organization** to link provider resources into another **Organization**.
- A **Provider Credential** must pass the **Storage Security Gate** before production **Secret Sync** can use it.
- A **Scoped Provider Token** is a **Provider Credential**.
- A **Secret Sync** belongs to one **Project**.
- A **Secret Sync** uses one **App Connection** to write to one **Sync Target**.
- A **Secret Sync** has one or more exact **Secret Sync Bindings**.
- A **Secret Sync** performs **Sync Execution Revalidation** before decrypting **Sensitive Values** or writing provider-side values.
- A **Secret Sync** plan may use cached provider metadata, but cached planning metadata does not authorize decrypt or provider writes.
- **Sync Execution Revalidation** checks **Provider Account Linkage**, **Connection Boundary**, provider credential scope, **Sync Target** identity, provider-side resource identity, required provider protection state, and eligible source version.
- **Sync Execution Revalidation** fails closed on **Provider Drift**.
- **Provider Drift** during **Sync Execution Revalidation** returns stable code `sync.provider_drift`.
- **Provider Drift** blocks **Sensitive Value** decrypt and provider writes.
- Resolving **Provider Drift** requires provider reauthorization or a configuration change; if a **Protected Environment** is involved, that configuration change is a **Protected Delivery Configuration Change**.
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
- Enabling or running a **Secret Sync** requires every binding to have an insecur-managed value: **Current Version** for non-protected **Environments** and **Published Version** for **Protected Environments**.
- Enabling or running a **Secret Sync** fails with `sync.source_value_missing` when a binding has no eligible version.
- An **Orphaned Managed Provider Copy** is cleanup metadata and is not a **Secret Import** source.
- A **GitHub Environment** can be a **Sync Target** for GitHub Actions secrets.
- A protected GitHub Actions **Secret Sync** requires **GitHub Environment Protection** before values are delivered.
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
> **Domain expert:** "No. An **Approval Request** does not expire by age in V1. It stays pending until a **User** approves it, explicitly cancels it, or it is superseded by a newer request for the same **Protected Environment**."
>
> **Dev:** "If the agent keeps editing after asking for approval, should approval be blocked?"
> **Domain expert:** "No. Warn that newer **Draft Versions** exist. If those should go live too, request **Promotion** again, which performs **Approval Request Supersession** for the prior pending request in that **Protected Environment**."
>
> **Dev:** "Does approval freeze the sync destinations the human saw?"
> **Domain expert:** "No. The **Promotion Change Set** freezes only **Draft Version** identity. The **Approval Impact Review** must be recomputed before approval, and stale approval screens require fresh review."
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
- "deployment" should be written as **Instance** when referring to one insecur installation and its global configuration.
- "signup" is ambiguous between **User** creation, **Organization** creation, and the full **Public Onboarding** flow; use the precise term.
- "invite" should be written as **Invitation** when referring to pending membership acceptance.
- "ban" and "disable tenant" should be written as **Tenant Suspension** when the organization still exists for evidence and remediation.
- "support access" and "operator access" should be written as **Service Access** when the action operates insecur across organizations.
- "admin" is ambiguous; use **Role** for customer organization access and **Service Access** for service-level operations.
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
- "promote all" and "all staged changes" should be written as an explicit **Promotion Change Set** with exact **Draft Versions**.
- "overwrite approval request" should be written as **Approval Request Supersession**; the old request is marked superseded, not mutated in place.
- "approval diff" should be written as **Approval Impact Review** when referring to metadata-only delivery and sync impact.
- "agent summary" should be written as **Approval Context Note** when it is requester-supplied explanatory text on an **Approval Request**.
- "approval comment" should be written as **Approval Context Note** when the text explains a protected approval request.
- "approval email" and "approval ping" should be written as **Approval Notification** when referring to out-of-band alerts.
- "push approval details" should not be used; push **Approval Notifications** carry generic preview-safe alerts, not approval details.
- "view sensitive details" should be written as satisfying the **Sensitive Detail Gate** when decrypted **Sensitive Metadata** is displayed.
- "secret name", "environment name", and "project name" should be written as **Display Name** when they are user-authored product labels.
- "email approval" should not be used; approval happens in the authenticated approval view, not in email.
- "push token" should be written as **Push Device Registration** when ownership, revocation, or notification delivery is the boundary.
- "primary approval path" should be written as **Primary Approval Notification Channel** only when referring to notification preference, not approval authority.
- "approval source of truth" should refer to server-generated **Promotion Change Set** and **Approval Impact Review** facts, not an **Approval Context Note**.
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
