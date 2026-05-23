# insecur

A self-hosted, multi-tenant secrets manager for the Cloudflare + Vercel + GitHub Actions stack. Cloudflare Workers + D1, envelope encryption with WebCrypto, OAuth app connections, and push+pull sync to your platforms.

> Yes, the name is on purpose.

## Layout

```
apps/
  worker/   Cloudflare Worker API (Hono + D1)
packages/
  cli/      Node CLI for pulling .env and running commands with injected env
```

## Quick start

See [docs/setup.md](docs/setup.md).

The design notes live in [docs/architecture.md](docs/architecture.md), the CLI/sync plan lives in [docs/cli-and-sync.md](docs/cli-and-sync.md), and the security planning checklist lives in [docs/security-plan.md](docs/security-plan.md). Architectural decisions are indexed in [docs/adr/README.md](docs/adr/README.md).

## Phases

- **1** (current scaffold) — CRUD + versioning + audit + GitHub OAuth scaffold + envelope encryption + scoped machine tokens + CLI `.env` pull
- **2** — Tenant-first schema, organization/project memberships, role enforcement, WorkOS AuthKit human auth, tenant-qualified routes, organization/project data keys
- **3** — Machine identities + GitHub Actions OIDC federation for short-lived CI access
- **4** — OAuth app connections + sync engines for Vercel, GitHub, and Cloudflare Worker secrets
- **5** — Focused UI, key/credential rotation workflows, R2 backups, restore tests
