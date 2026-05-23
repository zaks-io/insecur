# Project Status

Last updated: 2026-05-23

## Current State

insecur is an early Cloudflare-native secrets manager scaffold. The repo has a working Turborepo layout, a Cloudflare Worker API package, a Node CLI package, setup docs, architecture notes, and agent configuration.

The GitHub repository exists at `zaks-io/insecur` and is configured as the local `origin` remote.

## Implemented

- pnpm + Turborepo monorepo
- `apps/worker` Cloudflare Worker API using Hono and D1
- `packages/cli` Node CLI
- D1 schema for identities, tokens, projects, environments, secrets, secret versions, and audit log
- WebCrypto envelope encryption for immutable secret versions
- GitHub OAuth human login with an allowlist
- HMAC-signed session cookies
- Machine tokens hashed at rest
- Project/action scoped machine token authorization
- Secret CRUD, version history, rollback, and dotenv export
- Audit logging for authenticated actions and denied authorization attempts
- CLI `login`, `pull`, and `run`
- Basic API hardening headers and `Cache-Control: no-store` for `/v1/*`
- Input validation for project slugs, environment slugs, and secret names

## Verified Locally

- `pnpm typecheck`
- `pnpm build`

The Worker build uses `wrangler deploy --dry-run --outdir dist`.

## Not Yet Done

- Cloudflare D1 database has not been provisioned for this repo state
- `apps/worker/wrangler.toml` still contains `REPLACE_WITH_YOUR_D1_ID`
- Production Worker deployment has not been smoke-tested
- Initial git commit has not been created
- No GitHub labels have been created yet
- No UI exists
- No GitHub Actions OIDC federation endpoint exists
- No sync engines exist yet for Vercel, GitHub Actions secrets, or Cloudflare Worker secrets
- No rotation framework exists
- No R2 backup or restore test exists
- No true external SaaS tenancy model exists yet

## Important Product Boundary

The current authorization model is project-scoped and suitable for Isaac's personal stack or a small trusted team. It is not yet ready to host unrelated external tenants on `insecur.cloud`.

Before public multi-tenant use, add tenant or workspace tables, memberships, roles, tenant-qualified routes, tenant-aware sync credentials, and tenant-bounded audit/export behavior.

## Recommended Next Steps

1. Create the initial commit and push to `zaks-io/insecur`.
2. Create the default triage labels in GitHub.
3. Provision D1, set Worker secrets, run migrations, deploy, and smoke-test Phase 1 end to end.
4. Implement GitHub Actions OIDC federation for short-lived CI access.
5. Add sync engines for Vercel, GitHub Actions secrets, and Cloudflare Worker secrets.
6. Add the focused UI after the API and sync flows are verified.
