# Architecture

insecur is a Cloudflare-native secrets control plane for a Cloudflare, Vercel, and GitHub Actions stack. It borrows proven product ideas from larger secrets platforms, but keeps the implementation narrow: one source of truth, scoped machine access, auditability, immutable versions, and platform sync.

## Product Boundary

The goal is not to clone a full enterprise secrets platform. The first-class use case is a small team or personal stack that wants professional controls without long-lived containers or broad enterprise integrations.

In scope:

- Cloudflare Workers API with D1 metadata storage
- WebCrypto envelope encryption for secret versions
- GitHub OAuth for humans
- Scoped machine tokens and future GitHub Actions OIDC federation
- CLI pull and run flows
- Push sync targets for Vercel env vars, GitHub Actions secrets, and Cloudflare Worker secrets
- Audit log, version history, rollback, rotation hooks, and encrypted backups

Out of scope unless the product direction changes:

- SCIM, LDAP, SAML, PAM, and HSM integrations
- Dynamic database credentials across many database engines
- Long-lived Docker services
- Broad enterprise policy surfaces before the core stack is excellent

## Monorepo Shape

The repository follows Turborepo conventions:

- `apps/worker` is the deployable Cloudflare Worker service.
- `packages/cli` is the distributable Node CLI.
- Root scripts call `turbo run ...` so builds and typechecks use the package graph and cache correctly.
- Package scripts stay local to each workspace. The root only orchestrates.

## Security Model

Secrets are stored as immutable versions. Each version gets a fresh AES-256-GCM data encryption key. The DEK is wrapped by a master KEK stored as a Worker secret, and the ciphertext plus wrapped DEK are stored in D1.

Human users authenticate through GitHub OAuth and are allowlisted by login. Machine access uses bearer tokens that are SHA-256 hashed at rest. Token scopes are enforced at request time:

- `projects: ["*"]` or explicit project slugs
- `actions: ["read"]`, `["write"]`, or `["read", "write"]`

Humans can create projects, environments, and machine tokens. Machines can only read or write secrets inside their project/action scope. Token administration is human-only.

The next major security step is GitHub Actions OIDC federation, so CI jobs can obtain short-lived project-scoped access without storing a long-lived machine token in GitHub.

## Tenancy

The current runtime isolation boundary is project-scoped authorization. That is enough for a single owner or small trusted team managing multiple apps, but it is not the final model for hosting unrelated external tenants.

Before treating `insecur.cloud` as a true multi-tenant SaaS, add workspace/tenant tables, explicit memberships, tenant-qualified project routes, and per-tenant audit/export boundaries. That schema change should happen before any public users depend on the API.
