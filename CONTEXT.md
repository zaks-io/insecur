# insecur Context

insecur is a secrets-management product for organizing, protecting, versioning, and syncing secrets across many projects and teams.

## Language

**Actor**:
A user or machine identity that can authenticate and attempt actions.
_Avoid_: account, principal

**Organization**:
The top-level tenant boundary that owns projects, memberships, machine identities, app connections, and audit log entries.
_Avoid_: account, workspace, tenant when "organization" is meant

**User**:
A human actor who can receive access through memberships.
_Avoid_: account, member when referring to the person

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

**Draft Version**:
An immutable secret version that is stored but not eligible for protected delivery.
_Avoid_: staged value when the immutable version is meant

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
The rule that plaintext secret values are never written to durable storage on insecur-controlled systems.
_Avoid_: encrypted at rest when plaintext persistence is the issue

**Secret-Free Logging**:
The rule that logs, traces, errors, audit metadata, and analytics never contain plaintext secret values.
_Avoid_: redacted when the value should never enter the log path

**Sensitive Metadata**:
Non-plaintext metadata that can reveal security-relevant structure, integrations, targets, names, or relationships.
_Avoid_: safe metadata

**Sensitive Metadata Encryption**:
The rule that Sensitive Metadata is encrypted at rest under tenant-bound data keys, while only opaque resource IDs remain plaintext for joins and lookup.
_Avoid_: metadata-only when storage protection is meant

**Opaque Resource ID**:
A non-semantic identifier used for durable references, joins, and configured selectors.
_Avoid_: slug when a durable selector is meant

**Sensitive Display Name**:
A human-readable name stored as Sensitive Metadata and decrypted only after authorization for display.
_Avoid_: slug when the name reveals security-relevant structure

**Scoped List**:
An authorized list bounded by Organization, Project, Environment, or resource scope that may display decrypted Sensitive Metadata after authorization.
_Avoid_: search when configured discovery is meant

**Configured Selector**:
An opaque resource ID used to select a configured object without searching or storing plaintext Sensitive Metadata selectors.
_Avoid_: slug, search term

**Safe Sensitive Input Path**:
An input path for secret values or credentials that avoids URLs, query strings, route params, command arguments, logs, and shell history.
_Avoid_: value flag when the value itself is sensitive

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

**Provider Credential**:
A sensitive external-provider credential stored by an app connection.
_Avoid_: API key when the credential might be OAuth-derived or installation-derived

**Scoped Provider Token**:
A manually created external-provider token limited to a narrow provider account, resource, and permission set.
_Avoid_: global API key

**Connection Boundary**:
The provider resources an app connection is allowed to reach.
_Avoid_: blast radius when referring to the configured boundary

**Secret Sync**:
A project-level rule that pushes secrets to a sync target through an app connection.
_Avoid_: integration, deploy, replication

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

- An **Organization** owns zero or more **Projects**.
- An **Organization** owns zero or more **Machine Identities**.
- An **Organization** owns zero or more **App Connections**.
- An **Organization** owns **Audit Log** entries for actions within its boundary.
- A **User** can have **Memberships** in many **Organizations** and **Projects**.
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
- A **Secret Version** may be a **Draft Version** before **Promotion**.
- A **Protected Environment** delivers only **Published Versions**.
- A **Secret** has exactly one **Current Version** once it has a value.
- A **Current Version** is the default **Secret Source of Truth** for non-protected delivery.
- A **Published Version** is the **Secret Source of Truth** for protected delivery.
- A **Promotion** makes a **Secret Version** the **Published Version** for protected delivery.
- A **Rollback** creates a new **Secret Version** from an older retained encrypted **Secret Version** and promotes it.
- A **Rollback Retention Window** controls how long older **Published Versions** remain rollback-eligible.
- **No Plaintext Persistence** applies to **Secrets**, **Provider Credentials**, key material, and retained rollback versions.
- **Secret-Free Logging** applies to every **Secret Egress**, **Secret Sync**, **Runtime Injection**, and **Operation**.
- **Sensitive Metadata** requires **Sensitive Metadata Encryption** before durable storage.
- **Opaque Resource IDs** are the only plaintext durable selectors for server-side resources.
- **Sensitive Display Names** can appear in **Scoped Lists** only after authorization.
- **Secrets** and **Provider Credentials** enter insecur only through **Safe Sensitive Input Paths**.
- A **Secret Egress** moves a **Secret** value through either **Secret Delivery** or **Secret Reveal**.
- **Runtime Injection** is a kind of **Secret Delivery**.
- A **CLI Profile** can select defaults for **Runtime Injection**.
- A **CLI Profile** may reference one **Runtime Policy Key** by opaque ID.
- A **Runtime Policy Key** is a **Configured Selector**.
- A **Runtime Policy Key** resolves to exactly one **Runtime Injection Policy**.
- A **Runtime Injection Policy** has one or more immutable **Runtime Injection Policy Versions**.
- The active **Runtime Injection Policy Version** authorizes **Runtime Injection** for exact **Secret** bindings.
- **Runtime Policy Version Retention** preserves **Runtime Injection Policy Versions** independently of **Rollback Retention Window**.
- A **Runtime Injection Policy Version** stores immutable secret IDs and historical secret/display names as **Sensitive Metadata**.
- An **Injection Grant** is issued from exactly one **Runtime Injection Policy Version**.
- An **Injection Grant** is fresh, one-use, and non-reusable.
- A **Runtime Injection Policy Version** may require a **Command Fingerprint**.
- **Runtime Injection** crosses the **Runtime Trust Boundary** when the child process starts.
- **Runtime Injection** obeys the **Command Output Boundary**.
- **Secret Use** allows **Secret Delivery** without **Secret Reveal**.
- A **Protected Environment** contains zero or more non-revealable **Secrets**.
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
- A **Provider Credential** must pass the **Storage Security Gate** before production **Secret Sync** can use it.
- A **Scoped Provider Token** is a **Provider Credential**.
- A **Secret Sync** belongs to one **Project**.
- A **Secret Sync** uses one **App Connection** to write to one **Sync Target**.
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

## Flagged Ambiguities

- "account" is ambiguous between **User** and **Organization**; use the precise term.
- "tenant" should be written as **Organization** unless discussing multi-tenancy as a general property.
- "credential" is overloaded; use **Auth Method**, **Machine Token**, **Connection Method**, or **App Connection** depending on the boundary.
- "CLI token" should be written as **Ephemeral CLI Credential** when it is memory/session-only.
- "deploy key" should be written as **Environment Deploy Key** when it is scoped to one project environment.
- "deploy key for sync" is incorrect; **Secret Sync** uses an **App Connection**, not an **Environment Deploy Key**.
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
- "integration" is ambiguous between **App Connection** and **Secret Sync**; use **App Connection** for provider authorization and **Secret Sync** for project-level push behavior.
- "environment" is ambiguous between insecur **Environment** and GitHub Environment; qualify the provider term as GitHub Environment.
- "protected GitHub environment" is ambiguous; use **GitHub Environment Protection** when the provider-side rules are the security gate.
- "repo secret" is ambiguous; use GitHub repository secret when referring to repository-wide provider scope, and project-specific Secret Sync when referring to insecur's Project boundary.
- "latest" can mean newest by creation time or selected for reads; use **Current Version** when referring to the served value.
- "published" should be written as **Published Version** when referring to protected delivery eligibility.
- "draft" should be written as **Draft Version** when referring to an unpromoted stored value.
- "backup copy" should be written as **Rollback Retention Window** when referring to encrypted prior version retention for rollback.
- "single source of truth" should be written as **Secret Source of Truth** when referring to insecur's canonical value for sync and delivery.
- "profile" is ambiguous; use **CLI Profile** for named local command/deploy context.
- "storage is ready" should be written as **Storage Security Gate** when referring to the required tenant-bound encryption baseline for **Secrets**, **Provider Credentials**, and **Sensitive Metadata**.
- "encrypted at rest" is too weak when discussing storage invariants; use **No Plaintext Persistence**.
- "redact secrets" is too weak when discussing observability invariants; use **Secret-Free Logging**.
- "metadata-only" does not mean broadly safe; use **Sensitive Metadata** when names, targets, or relationships can expose security-relevant structure.
- "metadata encryption" should be written as **Sensitive Metadata Encryption** when referring to security-relevant names, targets, or relationships.
- "slug" should not be used for durable server-side selectors; use **Opaque Resource ID**.
- "search" should not be used for v1 Sensitive Metadata discovery; use **Scoped List** or **Configured Selector**.
- "name" is ambiguous; use **Sensitive Display Name** when the human-readable name reveals security-relevant structure.
- "pass the secret" is ambiguous; use **Safe Sensitive Input Path** when describing how values enter the system.
- "value flag" is unsafe for sensitive values; use stdin, a masked prompt, request body, or provider authorization flow.
- "plaintext access" is ambiguous between **Secret Delivery** and **Secret Reveal**; use **Secret Reveal** only when the caller receives the plaintext value.
- "keys" is ambiguous between **Secrets** and encryption keys; use **Secret** for application values and **Organization Data Key** or **Project Data Key** for encryption material.
- "access to secrets" is ambiguous between **Secret Use** and **Secret Reveal**; use **Secret Use** when the actor can trigger delivery but cannot receive the value.
- "default production variable" is unsafe language; use **Secret Shape** for shared metadata and **Environment Default** for a non-protected environment value.
- "shared secret" should mean **Shared Secret Source**, not environment inheritance or a copied value.
- "run policy" should be written as **Runtime Injection Policy** when it authorizes secret delivery.
- "wrapper" is ambiguous; use **Runtime Injection** for the delivery behavior, and say separate helper process only when a distinct local process is meant.
- "sandbox" should not be used for **Runtime Injection** unless the child process is actually isolated from its own environment and outputs.
