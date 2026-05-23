# insecur Context

## What This Is

insecur is a Cloudflare-native, multi-tenant secrets manager for a Cloudflare, Vercel, and GitHub Actions stack.

It is inspired by the best ideas in mature secrets platforms, especially envelope encryption, immutable versions, project/environment hierarchy, audit logs, machine identities, sync engines, and rotation. It is not trying to clone a broad enterprise platform.

The goal is a professional, secure, serverless control plane for managing secrets across many projects from one repository of truth, with a CLI and API that humans, agents, and CI can use safely.

## Product Intent

insecur should feel like a small, sharp internal security product:

- One source of truth for project secrets
- Tenant isolation for multiple organizations and teams
- Multi-user administration with explicit memberships and roles
- Push secrets to Vercel, GitHub Actions, and Cloudflare targets
- OAuth app based integrations where providers support them, so users can revoke connections without rotating copied API keys
- Pull secrets locally through the CLI
- Run commands with injected environment variables
- Keep version history and rollback
- Audit every meaningful access and mutation
- Avoid long-lived Docker services
- Stay narrow enough to operate confidently

The domain `insecur.cloud` is intentionally playful. The product itself should still be serious about security.

## Primary Stack

- Cloudflare Workers for the API
- Cloudflare D1 for tenants, memberships, metadata, versions, identities, tokens, app connections, syncs, and audit log
- WebCrypto for envelope encryption
- GitHub OAuth for human login
- GitHub Actions OIDC for future keyless CI access
- Vercel, GitHub Actions, and Cloudflare Worker secrets as sync targets
- Node CLI for local pull and run workflows
- pnpm + Turborepo for the monorepo

## Core Domain Terms

**Organization**

The top-level tenant. Every project, membership, role, machine identity, app connection, sync target, and audit log entry belongs to an organization. Organization slugs are the first tenant routing and authorization boundary.

**User**

A human actor who signs in through GitHub OAuth. A user receives access through organization and project memberships, not by global allowlist once multi-tenancy is implemented.

**Membership**

A link between an organization or project and an actor. Actors can be users, machine identities, or eventually groups. Memberships carry one or more roles.

**Role**

A named permission set. The near-term role set should stay small: owner, admin, developer, and read-only at organization or project scope. Custom roles are out of scope until the default roles prove insufficient.

**Project**

A logical application or service whose secrets are managed together inside an organization. Project slugs are unique within an organization, not globally.

**Environment**

A named deployment environment inside a project, such as `dev`, `preview`, `staging`, or `prod`.

**Secret**

A named value stored under a project and environment. Secret names should be valid environment variable names.

**Secret Version**

An immutable encrypted value for a secret. Updating a secret creates a new version rather than mutating the previous value.

**Current Version**

The version currently served by reads, CLI pulls, and sync operations.

**Rollback**

Creating a new version from an older version's encrypted payload and making that new version current.

**Machine Identity**

An authenticated non-human actor owned by an organization. Machine identities authenticate through an auth method and receive short-lived access tokens. GitHub Actions OIDC should be the preferred auth method for CI.

**Machine Token**

A bearer token used by automation. The current implementation uses long-lived hashed machine tokens. The multi-tenant target is short-lived access tokens issued to machine identities, with refresh or OIDC exchange credentials scoped by organization, project, environment, path, and action.

**Token Scope**

A permission set limiting what a machine identity or access token can do. The target scope includes organization, project, environment, optional path, and action.

**App Connection**

An organization-owned connection to an external provider such as Vercel, GitHub, or Cloudflare. App connections should use OAuth app or provider app installation flows where available. Stored provider credentials are encrypted and can be revoked or deleted without changing insecur user credentials.

**Connection Method**

The provider-specific way an app connection authenticates. OAuth app, GitHub App installation, and Vercel integration OAuth are preferred. If a provider endpoint only supports scoped API tokens, that method must be explicit, least-privileged, revocable at the provider, and never use broad global API keys.

**Auth Method**

The way a machine identity proves itself before receiving an access token. Initial auth methods should be GitHub Actions OIDC and a narrow bootstrap credential. Additional auth methods must earn their place by reducing stored secret risk or improving developer ergonomics.

**Secret Sync**

A project-level configuration that pushes secrets from one project/environment/path to an external sync target through an app connection.

**Sync Target**

An external destination that receives secrets from insecur, such as Vercel environment variables, GitHub Actions secrets, or Cloudflare Worker secrets.

**Organization Data Key**

A tenant-scoped encryption key used to protect organization-level sensitive data such as app connection credentials and identity auth method credentials. It is wrapped by the instance key material.

**Project Data Key**

A project-scoped encryption key used to protect project secrets. It is wrapped by instance key material or, later, by external KMS material when a project opts into that model.

**Key Version**

An individual active, retired, or revoked version of instance, organization, project, or record encryption material. Stored encrypted records include the key version needed to decrypt or rewrap them.

**Key Rotation**

The planned replacement of key material or provider credentials. Rotation should support root key rewraps, organization data key rotation, project data key rotation, machine identity credential rotation, app connection credential rotation, and secret version rotation.

**Audit Log**

An append-only record of authenticated actions, including reads, writes, rollbacks, token changes, and denied authorization attempts.

## Security Invariants

- Plaintext secrets should only exist transiently during request handling, CLI runtime injection, or outbound sync.
- D1 stores encrypted secret versions, never plaintext values.
- Secret versions are encrypted with AES-256-GCM using fresh nonces.
- Organization data keys and project data keys are cryptographically isolated and wrapped by instance key material stored as Worker secrets.
- Secret encryption uses authenticated data that binds ciphertext to organization, project, environment, secret, and version identity.
- Machine tokens are stored only as SHA-256 hashes.
- Short-lived machine access tokens are preferred over long-lived machine tokens.
- Token scopes and memberships are enforced before secret reads, writes, syncs, and app connection usage.
- Every tenant-owned table row is reachable only through an organization-qualified authorization check.
- Organization slugs and project slugs are never accepted as authorization proof by themselves.
- Humans can administer only organizations and projects where they have the required role.
- Machines can only act within their organization/project/environment/action scopes.
- App connection credentials are encrypted as organization data and are never returned in plaintext after creation.
- OAuth and provider app flows use exact redirect URIs, state, PKCE where supported, least-privilege scopes, and refresh-token rotation where providers support it.
- Human sessions use secure, HttpOnly, SameSite cookies; session identifiers rotate on login and privilege changes.
- Access tokens are short-lived, bearer tokens are never accepted in query strings, and refresh credentials are rotated or sender-constrained where practical.
- API responses must not leak internal error details or cross-tenant resource existence.
- Secret-bearing API responses should be marked `Cache-Control: no-store`.
- Audit log entries include organization context and, when applicable, project context.
- Secret version creation, current-version updates, and rollback are serialized so concurrent writers cannot create inconsistent version state.
- Key rotation is designed as a normal operation with audit entries, dry-run/plan output, resumable execution, and verification.
- Root and data key rotation should rewrap encrypted data keys or per-record DEKs when possible, avoiding plaintext secret exposure.
- Provider credential rotation should prefer provider refresh-token rotation or app reauthorization over copied static credentials.

## Target Tenancy Model

The target model is organization-scoped multi-tenancy for multiple users and many projects. It should be safe for separate teams or customers to share one insecur deployment, while keeping the product focused on Cloudflare, Vercel, and GitHub Actions.

Before hosting unrelated external tenants on `insecur.cloud`, the implementation must have:

- Organization, membership, role, and machine identity tables
- Tenant-qualified routes and authorization checks
- Organization and project data keys
- Per-tenant audit, export, and deletion boundaries
- Organization-owned app connections and project-owned secret syncs
- Tests proving cross-tenant object access is denied

## Deliberately Out Of Scope

These are not part of the near-term product unless the direction changes:

- SCIM
- LDAP
- SAML
- PAM
- HSM or PKCS#11 support
- Broad dynamic secret engines for many databases
- Long-lived container deployments
- Large enterprise policy surfaces before the core Cloudflare/Vercel/GitHub flow is excellent

## Phases

**Phase 1**

CRUD, immutable versions, audit log, GitHub OAuth, envelope encryption, scoped machine tokens, and CLI `.env` pull/run.

**Phase 2**

Tenant-first schema, organization/project memberships, role enforcement, organization and project data keys, and tenant-qualified routes.

**Phase 3**

Machine identities and GitHub Actions OIDC federation for short-lived, scoped CI access without storing long-lived tokens in GitHub.

**Phase 4**

OAuth app connections and sync engines for Vercel, GitHub Actions, and Cloudflare Worker secrets.

**Phase 5**

Focused UI, rotation framework, Cron Triggers, Durable Object locks, encrypted R2 backups, restore testing, key rotation procedure, and better token revocation workflows.

## Repo Shape

- `apps/worker`: Cloudflare Worker API
- `packages/cli`: Node CLI
- `docs/architecture.md`: system and product boundary notes
- `docs/cli-and-sync.md`: target CLI shape and secret sync workflow
- `docs/security-plan.md`: security plans, runbooks, and release gates
- `docs/setup.md`: deployment and first-use setup
- `docs/agents/`: configuration for engineering skills
- `docs/adr/`: architectural decision records

## Naming Guidance

Use the terms in this file when writing issues, PRDs, ADRs, tests, and comments. Prefer specific terms like "organization", "membership", "machine identity", "app connection", "secret sync", "secret version", "sync target", and "project scope" over vague terms like "tenant", "credential", "config", or "permission" when the specific concept applies.
