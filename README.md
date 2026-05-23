# insecur

A self-hosted secrets manager for the Cloudflare + Vercel + GitHub Actions stack. Cloudflare Workers + D1, envelope encryption with WebCrypto, push+pull sync to your platforms.

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

The design notes live in [docs/architecture.md](docs/architecture.md).

## Phases

- **1** (this) — CRUD + versioning + audit + GitHub OAuth + envelope encryption + scoped machine tokens + CLI `.env` pull
- **2** — GitHub Actions OIDC federation
- **3** — Sync engines (Vercel, GitHub, Cloudflare Worker secrets) + UI
- **4** — Rotation framework + R2 backups
- **5** — Hardening: token revocation UI, key rotation procedure, restore tests
