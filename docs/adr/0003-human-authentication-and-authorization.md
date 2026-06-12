# ADR-0003: Human Authentication And Authorization

Date: 2026-05-23

Status: Accepted

Human users authenticate through a managed human-auth provider, but login only establishes user identity. Authorization is scope-first: Effective Access authorization scopes are evaluated for decisions, and Roles are assignment bundles that contribute scopes. Authorization is granted through user and team memberships with built-in V1 role presets: owner, admin, developer, metadata viewer, approval, and read-only. V1 does not expose arbitrary human/team scope editing. The owner preset includes approval scopes for solo-owner operation; admin and developer presets do not. The Approval Role is the additive preset for granting approval scopes to non-owners without granting project configuration, App Connection, Secret Sync configuration, Runtime Injection Policy, or membership management scopes. Approval scopes may be organization-scoped or project-scoped; approval attempts evaluate Effective Access for the Project and Protected Environment affected by the Approval Request. V1 creates one non-authorizing default Team per Organization and Invitation acceptance adds the User to that default Team unless a future Invitation workflow explicitly targets another Team; access still requires an explicit Membership. Each V1 Invitation targets exactly one Membership grant: either one organization-scoped role or one project-scoped role. Rich team management, nested teams, directory sync, and SCIM workflows are deferred. Built-in roles are backed by granular authorization scopes so custom role management or explicit human/team scope assignment can be added later without changing authorization checks.

## Consequences

The current global GitHub allowlist is disposable learning code and must not remain as a supported auth mode. V1 production use requires membership checks on every object access, organization-qualified routes, denial behavior that does not reveal cross-tenant resource existence, secure session cookies, CSRF protection for browser mutations, session rotation after privilege changes, and MFA before v1 production use.

MFA is a product requirement, not a best-effort identity-provider assumption. ADR-0009 selects WorkOS-backed MFA without SMS and defines High-Assurance Challenges for high-risk human actions; ADR-0010 selects WorkOS AuthKit as the full human authentication broker.

## Amendment (2026-06-11): Built-In Role presets are six, including the Metadata Viewer Role

The role-preset list above originally read owner, admin, developer, approval, and read-only. CONTEXT.md's Built-In Roles list is canonical and names six presets, so the sentence has been edited in place to include the Metadata Viewer Role. The Metadata Viewer Role is the additive Built-In Role for granting scoped metadata detail visibility to non-owners where Metadata Visibility Policy allows it. It must not authorize Sensitive Values, Secret Reveal, Secret Delivery, Runtime Injection, Secret Sync, configuration mutation, or approval authority; it does not bypass the Sensitive Detail Gate for decrypted Sensitive Metadata; and Machine Identities do not receive it in V1.

Known code divergence: `packages/access/src/built-in-role-scopes.ts` currently implements only the five-preset set and carries no metadata-viewer preset bundle. Adding the metadata-viewer bundle is tracked by a follow-up implementation ticket; this amendment does not scope it into the First Value Slice.

## Amendment (2026-06-11): Organization-qualified route shape

Organization-qualified paths (`/v1/orgs/:org/...`) are required for all organization-scoped resource routes in production. Two exceptions are recorded:

- Onboarding and guided-provisioning routes (for example `POST /v1/onboarding/personal-organization`) resolve the Organization from the authenticated session, because the Organization does not exist before the call.
- The shipped First Value by-variable-key secret-write and runtime-injection grant routes (`POST /v1/projects/:project/environments/:env/secrets/by-variable-key`, `POST /v1/runtime-injection/grants`, and `POST /v1/runtime-injection/grants/:grantId/consume`) are a recorded divergence that must be re-homed under `/v1/orgs/:org` before the Production MVP acceptance gate; an owning Linear ticket tracks the re-homing.

Membership and Effective Access enforcement is unchanged either way: every route resolves tenant context through membership checks regardless of whether the organization arrives in the path or from the session.
