# Machine Access And Provider Connections

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Machine Access And Provider Connections

**Protected Environment**:
An environment whose secrets do not support secret reveal; its protected status is fixed at creation and cannot be toggled.
_Avoid_: production when the protection policy is meant, demote/promote when the fixed-at-creation protection flag is meant, production secret when discussing reveal and delivery policy, make this environment protected / toggle protection / lock the environment; protected status is fixed at creation, changing it means creating a new Environment

**Machine Identity**:
A non-human actor owned by an organization.
_Avoid_: bot user, service account, machine role; Machine Identities receive Authorization Scopes via project-scoped Memberships, credentials receive Credential Scopes, deploy key membership; use Machine Identity project Membership plus Environment Deploy Key Credential Scopes

**Machine Token**:
A bearer credential associated with machine access.
_Avoid_: API key when referring to insecur-issued automation access

**Ephemeral CLI Credential**:
A short-lived credential held only in process memory or a child shell environment for one CLI session.
_Avoid_: saved token, credential cache, CLI token when it is memory/session-only

**Environment Deploy Key**:
An Insecur-specific machine auth method scoped to one organization, project, and environment for runtime injection.
_Avoid_: SSH deploy key, Git deploy key, deploy token when the environment boundary matters, actor when the **Machine Identity** is meant, deploy key when scoped to one project environment

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
_Avoid_: integration when referring to the stored provider relationship, deploy key for sync is incorrect; Secret Sync uses an App Connection, not an Environment Deploy Key, user-owned connection should be an Organization-owned App Connection recording the User who performed setup; not deleted when that User is offboarded

**Connection Method**:
The provider-specific way an app connection authenticates.
_Avoid_: auth method when referring to external provider authentication

**Provider App Registration**:
The Instance-scoped registration of an external provider's installable app or OAuth app, such as a GitHub App or Vercel Integration, that supplies the client identity and Instance-derived callback used by a **Connection Method**. Each **Instance** holds its own; a **Hosted Instance** and a **Self-Hosted Instance** differ only in who registers the provider app and owns its credentials.
_Avoid_: App Connection when the Instance-level provider app identity is meant, OAuth app when human authentication is meant, integration

**Provider Authorization Callback**:
The return from an external provider OAuth or app-install flow that may create, reauthorize, or replace an App Connection credential.
_Avoid_: login callback when the provider is authorizing a delivery integration, OAuth callback when the flow can create or update an App Connection

**Provider Account Linkage**:
The verified relationship between an App Connection and the external provider account, installation, team, repository, project, worker, or resource boundary it is allowed to control.
_Avoid_: connected account when the tenant boundary is the concern

**Provider Credential**:
A sensitive external-provider credential stored by an app connection.
_Avoid_: API key when the credential might be OAuth-derived or installation-derived

**Scoped Provider Token**:
A manually created external-provider token limited to a narrow provider account, resource, and permission set.
_Avoid_: global API key, API key for manually created provider tokens (vs deployment secret for insecur's own platform/provider keys)

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
_Avoid_: transient provider error when provider security state changed, provider changed under us when current provider state no longer matches authorized configuration
