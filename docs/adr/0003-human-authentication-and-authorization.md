# ADR-0003: Human Authentication And Authorization

Date: 2026-05-23

Status: Accepted

Human users authenticate through a managed human-auth provider, but login only establishes user identity. Authorization is scope-first: Effective Access authorization scopes are evaluated for decisions, and Roles are assignment bundles that contribute scopes. Authorization is granted through user and team memberships with built-in V1 role presets: owner, admin, developer, approval, and read-only. V1 does not expose arbitrary human/team scope editing. The owner preset includes approval scopes for solo-owner operation; admin and developer presets do not. The Approval Role is the additive preset for granting approval scopes to non-owners without granting project configuration, App Connection, Secret Sync configuration, Runtime Injection Policy, or membership management scopes. Approval scopes may be organization-scoped or project-scoped; approval attempts evaluate Effective Access for the Project and Protected Environment affected by the Approval Request. V1 creates one non-authorizing default Team per Organization and Invitation acceptance adds the User to that default Team unless a future Invitation workflow explicitly targets another Team; access still requires an explicit Membership. Each V1 Invitation targets exactly one Membership grant: either one organization-scoped role or one project-scoped role. Rich team management, nested teams, directory sync, and SCIM workflows are deferred. Built-in roles are backed by granular authorization scopes so custom role management or explicit human/team scope assignment can be added later without changing authorization checks.

## Consequences

The current global GitHub allowlist is disposable learning code and must not remain as a supported auth mode. V1 production use requires membership checks on every object access, organization-qualified routes, denial behavior that does not reveal cross-tenant resource existence, secure session cookies, CSRF protection for browser mutations, session rotation after privilege changes, and MFA before v1 production use.

MFA is a product requirement, not a best-effort identity-provider assumption. ADR-0009 selects WorkOS-backed MFA without SMS and defines High-Assurance Challenges for high-risk human actions; ADR-0010 selects WorkOS AuthKit as the full human authentication broker.
