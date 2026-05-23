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

**Secret Version**:
An immutable historical value for a secret.
_Avoid_: revision

**Current Version**:
The selected secret version for a secret.
_Avoid_: latest when the selected version is meant

**Rollback**:
A secret lifecycle event that promotes an older value through a new current version.
_Avoid_: revert, restore when referring to secret version promotion

**Machine Identity**:
A non-human actor owned by an organization.
_Avoid_: bot user, service account

**Machine Token**:
A bearer credential associated with machine access.
_Avoid_: API key when referring to insecur-issued automation access

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
- A **Machine Identity** can have **Memberships** in its owning **Organization** and its **Projects**.
- A **Membership** links one **Actor** to one **Organization** or **Project** scope.
- A **Membership** carries one or more **Roles**.
- A **Project** belongs to exactly one **Organization**.
- A **Project** contains zero or more **Environments**.
- An **Environment** belongs to exactly one **Project**.
- An **Environment** contains zero or more **Secrets**.
- A **Secret** has one or more **Secret Versions**.
- A **Secret** has exactly one **Current Version** once it has a value.
- A **Rollback** creates a new **Secret Version** from an older **Secret Version** and makes it the **Current Version**.
- A **Machine Identity** proves itself through an **Auth Method**.
- A **Machine Token** is constrained by a **Token Scope**.
- An **App Connection** uses one **Connection Method**.
- An **App Connection** may store one or more **Provider Credentials**.
- An **App Connection** has one **Connection Boundary**.
- A **Scoped Provider Token** is a **Provider Credential**.
- A **Secret Sync** belongs to one **Project**.
- A **Secret Sync** uses one **App Connection** to write to one **Sync Target**.
- A **Secret Sync** run creates one **Operation**.
- An **Operation** produces one or more **Audit Log** entries.
- An **Audit Export** contains one or more **Audit Log** entries.
- An **Organization Data Key** protects organization-owned sensitive data.
- A **Project Data Key** protects project secret data.
- **Key Rotation** creates or activates a new **Key Version**.

## Example Dialogue

> **Dev:** "Can we use the same GitHub connection for every project?"
> **Domain expert:** "The **App Connection** belongs to the **Organization**, but each **Secret Sync** belongs to a **Project** and decides which **Environment** and **Sync Target** it writes to."
>
> **Dev:** "If I roll back `DATABASE_URL`, do we point reads at the old version?"
> **Domain expert:** "No. A **Rollback** creates a new **Secret Version** from the older value and makes that new version the **Current Version**."

## Flagged Ambiguities

- "account" is ambiguous between **User** and **Organization**; use the precise term.
- "tenant" should be written as **Organization** unless discussing multi-tenancy as a general property.
- "credential" is overloaded; use **Auth Method**, **Machine Token**, **Connection Method**, or **App Connection** depending on the boundary.
- "API key" is ambiguous; use **Scoped Provider Token** for manually created provider tokens and deployment secret for insecur's own platform/provider keys.
- "blast radius" should be written as **Connection Boundary** when referring to app connection resource limits.
- "integration" is ambiguous between **App Connection** and **Secret Sync**; use **App Connection** for provider authorization and **Secret Sync** for project-level push behavior.
- "latest" can mean newest by creation time or selected for reads; use **Current Version** when referring to the served value.
