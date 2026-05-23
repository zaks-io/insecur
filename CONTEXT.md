# insecur Context

## What This Is

insecur is a Cloudflare-native secrets manager for a Cloudflare, Vercel, and GitHub Actions stack.

It is inspired by the best ideas in mature secrets platforms, especially envelope encryption, immutable versions, project/environment hierarchy, audit logs, machine identities, sync engines, and rotation. It is not trying to clone a broad enterprise platform.

The goal is a professional, secure, serverless control plane for managing secrets across Isaac's stack from one repository of truth, with a CLI and API that agents and CI can use safely.

## Product Intent

insecur should feel like a small, sharp internal security product:

- One source of truth for project secrets
- Push secrets to Vercel, GitHub Actions, and Cloudflare targets
- Pull secrets locally through the CLI
- Run commands with injected environment variables
- Keep version history and rollback
- Audit every meaningful access and mutation
- Avoid long-lived Docker services
- Stay narrow enough to operate confidently

The domain `insecur.cloud` is intentionally playful. The product itself should still be serious about security.

## Primary Stack

- Cloudflare Workers for the API
- Cloudflare D1 for metadata, versions, identities, tokens, and audit log
- WebCrypto for envelope encryption
- GitHub OAuth for human login
- GitHub Actions OIDC for future keyless CI access
- Vercel, GitHub Actions, and Cloudflare Worker secrets as sync targets
- Node CLI for local pull and run workflows
- pnpm + Turborepo for the monorepo

## Core Domain Terms

**Project**

A logical application or service whose secrets are managed together. Project slugs are the main authorization boundary in the current implementation.

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

**Identity**

An authenticated actor. Humans authenticate through GitHub OAuth. Machines authenticate through scoped bearer tokens today and should use OIDC where possible in the future.

**Machine Token**

A long-lived bearer token for automation. Tokens are hashed at rest and scoped by project plus action.

**Token Scope**

A permission set of `{ projects, actions }`. Projects can be `["*"]` or explicit project slugs. Actions are `read` and `write`.

**Sync Target**

An external destination that receives secrets from insecur, such as Vercel environment variables, GitHub Actions secrets, or Cloudflare Worker secrets.

**Audit Log**

An append-only record of authenticated actions, including reads, writes, rollbacks, token changes, and denied authorization attempts.

## Security Invariants

- Plaintext secrets should only exist transiently during request handling, CLI runtime injection, or outbound sync.
- D1 stores encrypted secret versions, never plaintext values.
- Each secret version gets a fresh AES-256-GCM data encryption key.
- Data encryption keys are wrapped by a master KEK stored as a Worker secret.
- Machine tokens are stored only as SHA-256 hashes.
- Token scopes are enforced before secret reads and writes.
- Humans can administer projects, environments, and tokens.
- Machines can only act within their project/action scopes.
- API responses should avoid leaking internal error details.
- Secret-bearing API responses should be marked `Cache-Control: no-store`.

## Current Tenancy Model

The current model is project-scoped authorization inside a trusted owner or small-team deployment. That is enough for Isaac's stack, but it is not yet a complete external SaaS tenancy model.

Before hosting unrelated external tenants on `insecur.cloud`, add:

- Tenant or workspace tables
- Membership and role tables
- Tenant-qualified routes
- Per-tenant audit and export boundaries
- Tenant-aware sync credentials

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

GitHub Actions OIDC federation for short-lived, scoped CI access without storing long-lived tokens in GitHub.

**Phase 3**

Sync engines for Vercel, GitHub Actions, and Cloudflare Worker secrets, plus a focused UI.

**Phase 4**

Rotation framework, Cron Triggers, Durable Object locks, and encrypted R2 backups.

**Phase 5**

Hardening, restore testing, key rotation procedure, and better token revocation workflows.

## Repo Shape

- `apps/worker`: Cloudflare Worker API
- `packages/cli`: Node CLI
- `docs/architecture.md`: system and product boundary notes
- `docs/setup.md`: deployment and first-use setup
- `docs/agents/`: configuration for engineering skills
- `docs/adr/`: future architectural decision records

## Naming Guidance

Use the terms in this file when writing issues, PRDs, ADRs, tests, and comments. Prefer specific terms like "machine token", "secret version", "sync target", and "project scope" over vague terms like "credential", "config", or "permission" when the specific concept applies.
