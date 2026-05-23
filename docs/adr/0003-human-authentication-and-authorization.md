# ADR-0003: Human Authentication And Authorization

Date: 2026-05-23

Status: Accepted

Human users will authenticate with GitHub OAuth, but OAuth login only establishes user identity. Authorization is granted through organization and project memberships with a small default role vocabulary: owner, admin, developer, and read-only.

## Consequences

The current global GitHub allowlist is a scaffold only. Multi-tenant use requires membership checks on every object access, organization-qualified routes, denial behavior that does not reveal cross-tenant resource existence, secure session cookies, CSRF protection for browser mutations, session rotation after privilege changes, and MFA before public multi-tenant use.
