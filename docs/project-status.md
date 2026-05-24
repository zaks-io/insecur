# Project Status

Last updated: 2026-05-23

## Current State

insecur currently contains disposable Cloudflare-native secrets manager learning code that was added before the product decisions in these docs were settled. The target product direction is public multi-tenant production from v1: multi-tenant, multi-user, and suitable for valuable secrets from the first production release, while staying focused on secure storage, provider sync for Cloudflare/Vercel/GitHub, and CLI runtime injection for deploys and local commands. V1 must not rely on single-organization, closed bootstrap, self-hosted, or trusted-tenant shortcuts.

The GitHub repository exists at `zaks-io/insecur` and is configured as the local `origin` remote.

## Disposable Existing Code

These surfaces exist in the repository but are not accepted V1 product decisions. They may be deleted freely, and any code reused for V1 must pass a targeted design and security review against the current docs.

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
- Input validation for opaque IDs and Display Names
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
- Current human authentication is GitHub OAuth scaffold, not WorkOS AuthKit
- Current machine tokens are long-lived instead of machine identity issued short-lived access tokens
- Current CLI authentication is not yet memory/session-only
- Environment-scoped deploy keys and deploy key rotation policies do not exist yet
- Current encryption model does not yet have organization data keys and project data keys
- Current encryption does not bind ciphertext to tenant/resource identity with authenticated data
- Sensitive Metadata encryption is not implemented yet
- No key version model or key rotation workflow exists yet
- Secret version writes and rollback need stronger concurrency guarantees before multi-user use
- Audit rows are not yet tenant-qualified with typed actor/resource fields and denied-auth coverage
- No tamper-evident audit export, hash chain, or HMACed manifest exists yet
- No app connection model exists for provider OAuth app installations
- No secret sync model exists yet for provider destinations
- No Cloudflare Queue-backed sync execution, retry, or dead-letter workflow exists yet
- No Durable Object provider-target serialization exists yet
- CLI/sync shape is documented but not implemented
- No cross-tenant authorization regression tests exist
- No security runbooks exist yet
- No public onboarding abuse controls, signup lockdown, or tenant suspension workflow exists yet
- No ASVS/API Top 10/security release gate exists yet
- No dependency, supply-chain, or secret scanning workflow exists yet
- No UI exists
- No WorkOS AuthKit, WorkOS MFA, or high-risk action challenge implementation exists yet
- No GitHub Actions OIDC federation endpoint exists
- No key rotation, machine identity credential rotation, app connection credential rotation, or provider reauthorization workflow exists
- No R2 backup or restore test exists

## Important Product Boundary

The current implementation is disposable learning code. It is not a dev-only product direction, not a supported product mode, not evidence of intended product behavior, and not safe for valuable production secrets or unrelated external tenants on `insecur.cloud`.

The first production release must meet the public multi-tenant production security baseline before storing valuable secrets: organization, membership, role, machine identity, app connection, secret sync, tenant-qualified route, tenant-aware key, tenant-bounded audit/export behavior, public onboarding controls, quotas, abuse handling, tenant enumeration defenses, and Service Access boundaries.

## Build Order

**V1 foundation**

Tenant-first schema, organization/project memberships, role enforcement, WorkOS AuthKit migration, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, AES-GCM authenticated data binding, Protected Environment promotion/rollback, the Storage Security Gate, and tenant-qualified routes.

**V1 machine access**

Machine identities, GitHub Actions OIDC federation, and environment-scoped deploy keys with configurable rotation policies for scoped Runtime Injection automation without storing broad long-lived tokens.

**V1 sync**

OAuth app connections and queue-backed sync engines for Vercel, GitHub Actions, and Cloudflare Worker secrets. Production sync remains blocked until the Storage Security Gate passes.

**V1 runtime injection**

Profile-ID-based `insecur run <profile-id> -- <command>` for deploys and local commands so developers and agents can use secrets without local secret files or secret reveal. Production runtime injection remains blocked until the Storage Security Gate passes.

**Post-v1 hardening**

Focused UI, rotation framework, Cron Triggers, Durable Object serialization, encrypted R2 backups, restore testing, key rotation procedure, and better token revocation workflows.

## Recommended Next Steps

1. Implement the tenant-first schema: organizations, memberships, roles, tenant-qualified audit log, and project ownership by organization.
2. Move route shape and authorization to organization-qualified object-level checks.
3. Add organization and project data keys before storing provider credentials or production secrets in multi-tenant mode.
4. Add key versions and root/organization/project data key rotation workflows.
5. Bind secret ciphertext to organization/project/environment/secret/version identity with AES-GCM authenticated data.
6. Add the Storage Security Gate so production Secret Sync and Runtime Injection fail closed until tenant-bound encryption for Secrets, Provider Credentials, and Sensitive Metadata is verified.
7. Add Protected Environment Draft Version, Promotion, Published Version, rollback, and Rollback Retention Window behavior.
8. Strengthen secret version write, promotion, and rollback concurrency guarantees.
9. Replace long-lived machine token flows with machine identities, environment-scoped deploy keys, configurable deploy key rotation policies, and short-lived access tokens.
10. Replace scaffold GitHub OAuth with WorkOS AuthKit for human authentication, MFA, and high-risk action challenge behavior.
11. Implement GitHub Actions OIDC federation for short-lived CI access.
12. Add memory/session-only CLI auth and developer-first CLI support for `insecur run <profile-id> -- <command>`, dry-runs, operation IDs, runtime injection, and metadata-only JSON output behind the Storage Security Gate.
13. Add OAuth app connections for Vercel, GitHub, and Cloudflare, then project-owned secret syncs behind the Storage Security Gate.
14. Implement the sync lifecycle from `docs/cli-and-sync.md`: connect, create, plan, queue-backed run, verify, retry/reauth.
15. Add Cloudflare Queues, retry, dead-letter handling, and Durable Object provider-target serialization for sync operations.
16. Add sync operation audit events for enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release.
17. Add tamper-evident audit exports with JSONL hash chains, HMACed manifests, and `audit verify`.
18. Write the security runbooks listed in `docs/security-plan.md`.
19. Add public onboarding abuse controls, signup lockdown, tenant suspension, quotas, and tenant enumeration tests.
20. Add security release gates for ASVS/API Top 10 checks, dependency scanning, and secret scanning.
21. Add the focused UI after API, CLI, and sync flows are verified.
