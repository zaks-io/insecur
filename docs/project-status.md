# Project Status

Last updated: 2026-05-25

## Current State

insecur currently contains disposable Cloudflare-native secrets manager learning code that was added before the product decisions in these docs were settled. The target product direction is Small-Group Production first: personal projects and relatively small trusted groups using production-quality secret protection, while the underlying model stays enterprise-ready through organizations, memberships, roles, authorization scopes, tenant-qualified audit, and tenant-bound keys. V1 is split into a First Value Milestone and a Production Delivery Milestone. First Value focuses on guided first run through a Personal Organization with a provider-free First Value Proof in a non-protected development Environment. Production Delivery focuses on secure storage, provider sync for Cloudflare/Vercel/GitHub, protected delivery, and CLI runtime injection for deploys and local commands.

The flagship V1 promise is to let agents and CI use production secrets for approved deploy and runtime workflows without giving local agents or ordinary human sessions a read path to Protected Environment Sensitive Values.

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
- `docs/security-plan.md` documenting security plans
- `docs/security-runbooks-and-release-gates.md` documenting the runbook template, release gate profiles, and evidence bundle

## Verified Locally

- `pnpm typecheck`
- `pnpm build`

The Worker build uses `wrangler deploy --dry-run --outdir dist`.

## Not Yet Done

- Neon Postgres has not been provisioned for the V1 target architecture
- Cloudflare Hyperdrive has not been configured for the V1 target architecture
- Current scaffold still contains D1 bindings and `apps/worker/wrangler.toml` still contains `REPLACE_WITH_YOUR_D1_ID`; these are disposable pre-V1 details, not the target persistence model
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
- The Security Runbooks And Release Gates contract is documented, but individual security runbooks have not been written yet
- No public onboarding abuse controls, signup lockdown, or tenant suspension workflow exists yet
- No ASVS/API Top 10/security release gate automation or evidence bundle exists yet
- No dependency, supply-chain, or secret scanning workflow exists yet
- No UI exists
- No Human Approval Surface or Delivery Risk Policy Preset implementation exists yet
- No WorkOS AuthKit, WorkOS MFA, or high-risk action challenge implementation exists yet
- No GitHub Actions OIDC federation endpoint exists
- No key rotation, machine identity credential rotation, app connection credential rotation, or provider reauthorization workflow exists
- No R2 backup or restore test exists

## Important Product Boundary

The current implementation is disposable learning code. It is not a dev-only product direction, not a supported product mode, not evidence of intended product behavior, and not safe for valuable production secrets or unrelated external tenants on `insecur.cloud`.

The First Value Milestone is allowed to prove the non-protected development loop before production delivery is ready, but it is not safe for production-grade Sensitive Values. The Production Delivery Milestone must meet the Small-Group Production security baseline before storing valuable secrets: organization, membership, role, machine identity, app connection, secret sync, tenant-qualified route, tenant-aware key, tenant-bounded audit/export behavior, controlled Organization creation through Instance Operators or Guided Organization Provisioning, and Invitation-based Organization Access. Public onboarding controls, quotas, abuse handling, tenant enumeration defenses, and Service Access boundaries are required before enabling broad public signup or operating a Hosted Instance for unrelated tenants.

## Build Order

**First Value Milestone**

Guided Organization Provisioning for Personal Organizations with an owner Membership, Default Team, first Project, non-protected development Environment, developer-first CLI defaults, non-protected `secrets set --secret-name` create-or-update, service-generated Blind Secret Write, local `run --secret-name`, the copyable First Value Proof in `examples/first-value-proof`, metadata-only output, and enough tenant-qualified authorization/audit/encryption to avoid creating migration debt.

**Production Delivery Foundation**

Neon Postgres schema, Tenant-Scoped Store, Row-Level Security policies, Instance Bootstrap, WorkOS-backed Instance Identity Configuration, Bootstrap Operator Claim completion, first-Organization owner Membership, Default Team creation, Instance Operator-controlled Organization creation, Guided Organization Provisioning for Personal Organizations with a first Project and non-protected development Environment, organization/project memberships, scope-first authorization with built-in role presets, WorkOS AuthKit migration, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, AES-GCM authenticated data binding, Protected Environment promotion/rollback, the Storage Security Gate readiness contract in [storage-security-gate.md](storage-security-gate.md), and tenant-qualified routes.

**V1 machine access**

Machine identities, GitHub Actions OIDC federation, and environment-scoped deploy keys with configurable rotation policies for scoped Runtime Injection automation without storing broad long-lived tokens. This is the custody boundary that lets CI use Protected Environment Sensitive Values while local agents and ordinary human sessions cannot read them.

**V1 sync**

OAuth app connections and queue-backed sync engines for Vercel, GitHub Actions, and direct Cloudflare Worker secrets. Cloudflare Worker secret writes are production deploys for the affected Worker script/environment and must be presented as such in plan, approval, and audit output. Production sync remains blocked until the Storage Security Gate passes.

**V1 runtime injection**

Profile-ID-based `insecur run <profile-id> -- <command>` for deploys and local commands so developers and agents can use secrets without local secret files or secret reveal. The guided First Value Proof uses this path in a non-protected development Environment before any provider setup. Production runtime injection remains blocked until the Storage Security Gate passes.

**V1 approval UX and delivery policy**

Human Approval Surface for Protected Environment approval, High-Assurance Challenges, protected delivery configuration changes, protected Secret Sync enable/run, Cloudflare Worker Secret Deploy approval evidence, and Risk-Broadening Delivery Changes. Delivery Risk Policy Presets default to Balanced, first onboarding does not show a preset picker, and users can later switch to Strict or Automation-Friendly. They can allow configured non-protected development or preview delivery through agent-reachable CLI/API channels without making Protected Environment approval terminal-only. Under Balanced, preview automation requires environment-scoped Preview Automation Opt-In; under Automation-Friendly, the same Preview Automation Authority applies by default for non-protected preview Environments in scope. Preview Automation Authority can execute only existing Runtime Injection Policies, Secret Syncs, and Secret Sync Bindings. Presets are backed by versioned policy infrastructure so later enterprise controls do not require refactoring authorization or audit.

**Post-v1 hardening**

Focused UI, rotation framework, Cron Triggers, Durable Object serialization, encrypted R2 backups, restore testing, key rotation procedure, better token revocation workflows, and public-onboarding hardening for unrelated tenants.

## Recommended Next Steps

1. Build the First Value Milestone: Guided Organization Provisioning, Personal Organization, owner Membership, Default Team, first Project, non-protected development Environment, non-protected `secrets set --secret-name`, local `run --secret-name`, metadata-only output, and the copyable First Value Proof.
2. Implement the Production Delivery Foundation: Neon Postgres tenant-first schema, Tenant-Scoped Store, Row-Level Security policies, tenant-qualified audit log, project ownership by organization, Instance Bootstrap, Bootstrap Operator Claim completion, first-Organization owner Membership creation, Instance Operator-controlled Organization creation, organization/project memberships, and scope-first authorization.
3. Move route shape and authorization to organization-qualified object-level checks.
4. Add organization and project data keys before storing provider credentials or production secrets in multi-tenant mode.
5. Add key versions and root/organization/project data key rotation workflows.
6. Bind the secret ciphertext layer to organization/project/environment/secret identity and bind the DEK-wrap layer to the data-key version with AES-GCM authenticated data.
7. Add the Storage Security Gate from [storage-security-gate.md](storage-security-gate.md) so production Secret Delivery and Secret Sync fail closed until tenant-bound storage readiness is verified.
8. Add Protected Environment Draft Version, Promotion, Published Version, rollback, Rollback Retention Window behavior, and the Protected Change Orchestrator from [protected-change-orchestration.md](protected-change-orchestration.md).
9. Add the Human Approval Surface and Delivery Risk Policy Presets so Protected Environment gates are not terminal-only while non-protected preview/development relaxations are explicit, versioned, and audited.
10. Strengthen secret version write, promotion, and rollback concurrency guarantees.
11. Replace long-lived machine token flows with machine identities, environment-scoped deploy keys, configurable deploy key rotation policies, and short-lived access tokens.
12. Replace scaffold GitHub OAuth with WorkOS AuthKit for human authentication, MFA, and high-risk action challenge behavior.
13. Implement GitHub Actions OIDC federation for short-lived CI access.
14. Add memory/session-only CLI auth and developer-first CLI support for `insecur run <profile-id> -- <command>`, dry-runs, operation IDs, runtime injection, and metadata-only JSON output behind the Storage Security Gate.
15. Add OAuth app connections for Vercel, GitHub, and Cloudflare, then project-owned secret syncs behind the Storage Security Gate.
16. Implement the sync lifecycle from `docs/cli-and-sync.md`: connect, create, plan, queue-backed run, verify, retry/reauth.
17. Add Cloudflare Queues, retry, dead-letter handling, and Durable Object provider-target serialization for sync operations.
18. Add sync operation audit events for enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release.
19. Add tamper-evident audit exports with JSONL hash chains, HMACed manifests, and `audit verify`.
20. Write the security runbooks catalogued in [security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md).
21. Add public onboarding abuse controls, signup lockdown, tenant suspension, quotas, and tenant enumeration tests before broad public signup.
22. Add the security release gate evidence bundle and automation from [security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md), including ASVS/API Top 10 checks, dependency scanning, and secret scanning.
23. Add the broader focused UI after API, CLI, and sync flows are verified.
