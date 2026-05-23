# Project Status

Last updated: 2026-05-23

## Current State

insecur is an early Cloudflare-native secrets manager scaffold. The target product direction is now multi-tenant and multi-user, while staying focused on the Cloudflare, Vercel, and GitHub Actions stack. The repo has a working Turborepo layout, a Cloudflare Worker API package, a Node CLI package, setup docs, architecture notes, and agent configuration.

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
- ADRs documenting tenant-first architecture, Cloudflare-native scope, auth, machine identities, key rotation, app connections/syncs, CLI contract, and security gates
- `docs/cli-and-sync.md` documenting target CLI shape and secret sync workflow
- `docs/security-plan.md` documenting security plans, runbooks, and release gates

## Verified Locally

- `pnpm typecheck`
- `pnpm build`

The Worker build uses `wrangler deploy --dry-run --outdir dist`.

## Not Yet Done

- Cloudflare D1 database has not been provisioned for this repo state
- `apps/worker/wrangler.toml` still contains `REPLACE_WITH_YOUR_D1_ID`
- Production Worker deployment has not been smoke-tested
- No GitHub labels have been created yet
- Current schema is not tenant-first
- Current routes are not organization-qualified
- Current authorization is project-scoped, not membership/role based
- Current machine tokens are long-lived instead of machine identity issued short-lived access tokens
- Current encryption model does not yet have organization data keys and project data keys
- Current encryption does not bind ciphertext to tenant/resource identity with authenticated data
- No key version model or key rotation workflow exists yet
- Secret version writes and rollback need stronger concurrency guarantees before multi-user use
- Audit rows are not yet tenant-qualified with typed actor/resource fields and denied-auth coverage
- No app connection model exists for provider OAuth app installations
- No secret sync model exists yet for provider destinations
- CLI/sync shape is documented but not implemented
- No cross-tenant authorization regression tests exist
- No security runbooks exist yet
- No ASVS/API Top 10/security release gate exists yet
- No dependency, supply-chain, or secret scanning workflow exists yet
- No UI exists
- No GitHub Actions OIDC federation endpoint exists
- No key rotation, machine identity credential rotation, app connection credential rotation, or provider reauthorization workflow exists
- No R2 backup or restore test exists

## Important Product Boundary

The current implementation is a scaffold. The product direction is multi-tenant and multi-user, but the code is not yet safe for unrelated external tenants on `insecur.cloud`.

Before public multi-tenant use, add organization, membership, role, machine identity, app connection, secret sync, tenant-qualified route, tenant-aware key, and tenant-bounded audit/export behavior.

## Recommended Next Steps

1. Implement the tenant-first schema: organizations, memberships, roles, tenant-qualified audit log, and project ownership by organization.
2. Move route shape and authorization to organization-qualified object-level checks.
3. Add organization and project data keys before storing provider credentials or production secrets in multi-tenant mode.
4. Add key versions and root/organization/project data key rotation workflows.
5. Bind secret ciphertext to organization/project/environment/secret/version identity with AES-GCM authenticated data.
6. Strengthen secret version write and rollback concurrency guarantees.
7. Replace long-lived machine token flows with machine identities and short-lived access tokens.
8. Implement GitHub Actions OIDC federation for short-lived CI access.
9. Add OAuth app connections for Vercel, GitHub, and Cloudflare, then project-owned secret syncs.
10. Add developer-first CLI support for profiles, dry-runs, operation IDs, and JSON output.
11. Implement the sync lifecycle from `docs/cli-and-sync.md`: connect, create, plan, run, verify, retry/reauth.
12. Write the security runbooks listed in `docs/security-plan.md`.
13. Add security release gates for ASVS/API Top 10 checks, dependency scanning, and secret scanning.
14. Add the focused UI after API, CLI, and sync flows are verified.
