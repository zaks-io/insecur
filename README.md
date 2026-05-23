# insecur

A self-hosted, multi-tenant secrets manager for the Cloudflare + Vercel + GitHub Actions stack. Cloudflare Workers + D1, envelope encryption with WebCrypto, OAuth app connections, runtime injection, and provider sync without revealing plaintext secrets by default.

insecur's v1 product focus is narrow: store secrets securely as the source of truth, sync them to Cloudflare, Vercel, and GitHub when those platforms need native secrets, and inject them just-in-time for deploys or local commands so developers and agents do not need local secret files.

> Yes, the name is on purpose.

## Layout

```
apps/
  worker/   Cloudflare Worker API (Hono + D1)
packages/
  cli/      Node CLI for runtime injection and agent-safe operations
```

## Quick start

See [docs/setup.md](docs/setup.md).

The design notes live in [docs/architecture.md](docs/architecture.md), the CLI/sync plan lives in [docs/cli-and-sync.md](docs/cli-and-sync.md), and the security planning checklist lives in [docs/security-plan.md](docs/security-plan.md). Architectural decisions are indexed in [docs/adr/README.md](docs/adr/README.md).

## Production V1 Boundary

The first production release is not a dev-only secrets store. V1 must be safe to run as a public, multi-tenant-capable service even if the first real organization is Isaac's own organization managing Isaac's own projects.

The current code is a pre-v1 scaffold used to validate shape. It must not be treated as production-ready until the tenant-first authorization model, WorkOS AuthKit, short-lived machine access, tenant-bound key hierarchy, audit/export integrity, and security release gates are implemented.

Provider secrets are derived delivery targets, not the source of truth. Rotation and changes start in insecur, then flow through audited sync or runtime injection paths.

Production sync and runtime injection are blocked until the Storage Security Gate passes: root key material outside D1, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, and AES-GCM authenticated data binding ciphertext to organization, project, environment, secret, version, app connection, provider credential, and sensitive metadata identity.

## Build Order

- **Pre-v1 scaffold** — current CRUD/versioning/audit/CLI learning implementation
- **V1 foundation** — tenant-first schema, organization/project memberships, role enforcement, WorkOS AuthKit, tenant-qualified routes, organization/project data keys, key versions, protected promotion/rollback, and security gates
- **V1 machine access** — machine identities and GitHub Actions OIDC federation for short-lived CI access
- **V1 delivery** — OAuth app connections and sync engines for Vercel, GitHub, and Cloudflare Worker secrets, plus profile-based `insecur run` for deploy and local command injection
- **Post-v1 hardening** — focused UI, deeper rotation automation, R2 backups, restore tests, and operational polish
