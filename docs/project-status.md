# Project Status

Last updated: 2026-05-27

## Current State

insecur currently contains no product implementation. The disposable Cloudflare-native secrets manager learning code that predated these docs has been removed from the working tree per ADR-0018; what remains is the documentation, the workspace skeleton, First Value domain package scaffolds, and the copyable `examples/first-value-proof`. The next behavior written is the target product, built against these docs. The target product direction starts with Diskless Development Secret Use for developers and agents: replace plaintext local secret files with just-in-time Runtime Injection in a non-protected development Environment. The underlying model stays enterprise-ready through organizations, memberships, roles, authorization scopes, tenant-qualified audit, and tenant-bound keys so the same spine can grow into Small-Group Production. V1 is split into a First Value Milestone and a Production Delivery Milestone. First Value focuses on guided first run through a Personal Organization with a provider-free First Value Proof in a non-protected development Environment. Production Delivery focuses on secure storage, provider sync for Cloudflare/GitHub, protected delivery, and CLI runtime injection for deploys and local commands. The Vercel sync adapter is deferred past V1 behind the same provider port model.

The first V1 promise is to stop giving coding agents plaintext local secret files. The production promise is to let agents and CI cause approved deploy and runtime workflows without giving local agents or ordinary human sessions a read path to Protected Environment Sensitive Values.

The GitHub repository exists at `zaks-io/insecur` and is configured as the local `origin` remote.
Linear triage labels exist for team INS. Current active Linear projects are:
`Customer Discovery & Design Partners`, `First Value Build`, `Production Delivery Foundation`,
`Machine Access and CI Trust`, `Runtime Injection Delivery`,
`Provider Sync: GitHub and Cloudflare`, `Approval UX and Delivery Policy`, and
`Audit, Runbooks, and Release Gates`. First Value implementation work uses the parent workstreams
and dependency graph documented in [first-value-ticket-plan.md](specs/first-value-ticket-plan.md).
Linear project milestones and ticket publishing rules live in
[linear-ticketing.md](agents/linear-ticketing.md).

## Customer Validation Plan

Product excellence for insecur means proving a narrow customer pull before broadening the
platform. The first validation beachhead is agent-heavy solo developers and small trusted teams
shipping through Cloudflare Workers and GitHub Actions. The first product proof is the ordinary
First Value loop: provision a Personal Organization, create or generate one non-protected
development Secret through a Blind Secret Write, and run one local command through Runtime
Injection without creating a plaintext `.env` file or revealing the Sensitive Value in output.

The customer-validation operating plan lives in [customer-validation.md](customer-validation.md).
It calls for 20 discovery interviews, five manually supported design partners, and repeated
usage signals before widening the first product beyond the First Value proof. This is a
go-to-market and product-learning constraint, not a replacement for the security baseline.

## Removed Pre-V1 Scaffold

The disposable learning code has been deleted from the working tree per ADR-0018. None of it was an accepted product decision, so nothing carries forward; any equivalent capability in the target product is built fresh against the current docs and passes the security baseline, not reused from the scaffold. Recorded here only so the deletion is not mistaken for lost product work. What was removed:

- `apps/worker` Cloudflare Worker API using Hono and D1, including the D1 schema, migrations, and `wrangler.toml`
- `packages/cli` Node CLI (`login`, unsafe pre-V1 `pull`, `run`)
- WebCrypto envelope encryption for immutable secret versions
- GitHub OAuth human login with an allowlist and HMAC-signed session cookies
- Machine tokens hashed at rest with project/action scoped authorization
- Secret CRUD, version history, rollback, and dotenv export
- Audit logging, basic API hardening headers, and opaque-ID/Display-Name input validation
- The generated `dist/`, `node_modules/`, and `pnpm-lock.yaml`

### Kept (not scaffold)

- The workspace skeleton: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `turbo.json`, the package context map in `docs/context-map.md`, the `apps/worker` and `packages/cli` stubs, and the First Value domain package stubs under `packages/`.
- `examples/first-value-proof`, the copyable First Value Proof.
- All documentation: CONTEXT, the consolidated specs in `docs/specs/`, architecture, the ADRs, `docs/cli-and-sync.md`, `docs/security-plan.md`, and `docs/security-runbooks-and-release-gates.md`.

## Verified Locally

Nothing product-bearing to build or verify yet. The scaffold that previously passed `pnpm typecheck` and `pnpm build` has been removed; the new app and package source entrypoints are empty TypeScript modules, and `node_modules`/`pnpm-lock.yaml` are gone. The first meaningful build/typecheck baseline gets re-established when the target product's First Value slice is implemented.

## Not Yet Done

- Neon Postgres has not been provisioned for the V1 target architecture
- Cloudflare Hyperdrive has not been configured for the V1 target architecture
- Neither D1 nor any persistence is wired; the target persistence model (Neon Postgres) is not provisioned
- Production Worker deployment has not been smoke-tested
- No tenant-first schema exists yet
- No organization-qualified routes exist yet
- No membership/role-based authorization exists yet
- No human authentication exists yet; the target is WorkOS AuthKit
- No machine identity-issued short-lived access tokens exist yet
- No CLI authentication exists yet; the target is memory/session-only
- Environment-scoped deploy keys and deploy key rotation policies do not exist yet
- No organization data keys or project data keys exist yet
- No ciphertext binding to tenant/resource identity with authenticated data exists yet
- Sensitive Metadata encryption is not implemented yet
- No key version model or key rotation workflow exists yet
- No secret version write or rollback concurrency guarantees exist yet (needed before multi-user use)
- No tenant-qualified audit rows with typed actor/resource fields and denied-auth coverage exist yet
- No tamper-evident audit export, hash chain, or HMACed manifest exists yet
- No app connection model exists for provider OAuth app installations
- No secret sync model exists yet for provider destinations
- No inline sync execution, in-request retry, lease-row serialization, or `incomplete`-operation resume exists yet (ADR-0057)
- CLI/sync shape is documented but not implemented
- No cross-tenant authorization regression tests exist yet; the design is specified in [ADR-0054](adr/0054-tenant-isolation-tests-real-postgres.md) and [build-tooling.md](build-tooling.md) (real per-PR Neon Postgres as the `NOBYPASSRLS` runtime role, never SQLite/PGlite)
- The Security Runbooks And Release Gates contract is documented, but individual security runbooks have not been written yet
- No public onboarding abuse controls, signup lockdown, or tenant suspension workflow exists yet
- No ASVS/API Top 10/security release gate automation or evidence bundle exists yet
- No dependency, supply-chain, or secret scanning workflow exists yet; the design is specified in [ADR-0056](adr/0056-supply-chain-hardening-posture.md) and [build-tooling.md](build-tooling.md) (pnpm lifecycle blocking and release quarantine, Renovate floor, gitleaks/semgrep/syft/grype, daily CVE scan)
- No UI exists
- No Human Approval Surface or Delivery Risk Policy Preset implementation exists yet
- No WorkOS AuthKit, WorkOS MFA, or high-risk action challenge implementation exists yet
- No GitHub Actions OIDC federation endpoint exists
- No key rotation, machine identity credential rotation, app connection credential rotation, or provider reauthorization workflow exists
- No R2 backup or restore test exists

## Important Product Boundary

The removed scaffold was disposable learning code. It was not a dev-only product direction, not a supported product mode, not evidence of intended product behavior, and not safe for valuable production secrets or unrelated external tenants on `insecur.cloud`.

The First Value Milestone is allowed to prove the non-protected development loop before production delivery is ready, but it is not safe for production-grade Sensitive Values. The Production Delivery Milestone must meet the Small-Group Production security baseline before storing valuable secrets: organization, membership, role, machine identity, app connection, secret sync, tenant-qualified route, tenant-aware key, tenant-bounded audit/export behavior, controlled Organization creation through Instance Operators or Guided Organization Provisioning, and Invitation-based Organization Access. Public onboarding controls, quotas, abuse handling, tenant enumeration defenses, and Service Access boundaries are required before enabling broad public signup or operating a Hosted Instance for unrelated tenants.

## Build Order

This is a dependency-ordered implementation sequence, not a release plan. Which slice ships as which version is **not decided**; see [phasing.md](phasing.md). The milestone names below are build ordering, not version boundaries.

**First Value Milestone**

Guided Organization Provisioning for Personal Organizations with an owner Membership, Default Team, first Project, non-protected development Environment, developer-first CLI defaults with scoped-unique profile slugs and policy Display Names, non-protected `secrets set --variable-key` create-or-update, service-generated Blind Secret Write, local `run --variable-key`, Diskless Development Secret Use, the copyable First Value Proof in `examples/first-value-proof`, metadata-only output, and enough tenant-qualified authorization/audit/encryption to avoid creating migration debt. The governing integration contract is [first-value-milestone.md](first-value-milestone.md).

**Production Delivery Foundation**

Neon Postgres schema, Tenant-Scoped Store, Row-Level Security policies, Instance Bootstrap, WorkOS-backed Instance Identity Configuration, Bootstrap Operator Claim completion, first-Organization owner Membership, Default Team creation, Instance Operator-controlled Organization creation, Guided Organization Provisioning for Personal Organizations with a first Project and non-protected development Environment, organization/project memberships, scope-first authorization with built-in role presets, WorkOS AuthKit migration, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, AES-GCM authenticated data binding, Protected Environment promotion/rollback, the Storage Security Gate readiness contract in [storage-security-gate.md](storage-security-gate.md), and tenant-qualified routes.

**Machine Access and CI Trust**

Machine identities, GitHub Actions OIDC federation, and environment-scoped deploy keys with configurable rotation policies for scoped Runtime Injection automation without storing broad long-lived tokens. This is the custody boundary that lets CI use Protected Environment Sensitive Values while local agents and ordinary human sessions cannot read them.

**Provider Sync: GitHub and Cloudflare**

OAuth app connections and inline sync engines for GitHub Actions and direct Cloudflare Worker secrets. Cloudflare Worker secret writes are production deploys for the affected Worker script/environment and must be presented as such in plan, approval, and audit output. The Vercel sync adapter remains in the [deferred scope parking lot](phasing.md#deferred-scope-parking-lot) but stays additive behind the provider port model. Production sync remains blocked until the Storage Security Gate passes. Sync operation state, retry, resume, leases, and fencing tokens are governed by [operation-store.md](operation-store.md).

**Runtime Injection Delivery**

Profile-backed `insecur run <profile-slug-or-id> -- <command>` for deploys and local commands so developers and agents can use secrets without local secret files or secret reveal. The guided First Value Proof uses this path in a non-protected development Environment before any provider setup. Production runtime injection remains blocked until the Storage Security Gate passes.

**Approval UX and Delivery Policy**

Human Approval Surface for Protected Environment approval, High-Assurance Challenges, protected delivery configuration changes, protected Secret Sync enable/run, Cloudflare Worker Secret Deploy approval evidence, and Risk-Broadening Delivery Changes. Delivery Risk Policy Presets default to Balanced, first onboarding does not show a preset picker, and users can later switch to Strict or Automation-Friendly. They can allow configured non-protected development or preview delivery through agent-reachable CLI/API channels without making Protected Environment approval terminal-only. Under Balanced, preview automation requires environment-scoped Preview Automation Opt-In; under Automation-Friendly, the same Preview Automation Authority applies by default for non-protected preview Environments in scope. Preview Automation Authority can execute only existing Runtime Injection Policies, Secret Syncs, and Secret Sync Bindings. Presets are backed by versioned policy infrastructure so later enterprise controls do not require refactoring authorization or audit.

**Audit, Runbooks, and Release Gates**

Tenant-qualified audit hardening, tamper-evident audit exports with JSONL hash chains and HMACed manifests, `audit verify`, security runbooks, tested restore evidence, ASVS/API Top 10 checks, dependency scanning, secret scanning, SBOM/vulnerability scanning, the release-gate evidence bundle, and pre-production gate automation.

**Deferred scope**

Deferred work is tracked in [phasing.md](phasing.md#deferred-scope-parking-lot), not in Linear.
Do not create Linear projects, project milestones, parent issues, implementation issues, or
placeholder tickets for those items until they are promoted out of the deferred parking lot in the
repo docs.

## Recommended Next Steps

1. Work the `First Value Build` Linear graph from [first-value-ticket-plan.md](specs/first-value-ticket-plan.md), starting with the unblocked tooling baseline and the required human setup tickets for Neon, WorkOS, and Cloudflare Secrets Store.
2. Run the customer-validation loop from [customer-validation.md](customer-validation.md): 20 discovery interviews with agent-heavy teams, five design partners, and repeated First Value usage evidence.
3. Build the First Value Milestone through [first-value-milestone.md](first-value-milestone.md) as a narrow vertical slice through the real foundation: Tenant-Scoped Store, Row-Level Security, Effective Access, Guided Organization Provisioning, Personal Organization, owner Membership, Default Team, first Project, non-protected development Environment, tenant-bound Secret encryption, Secret Version Store, local `run --variable-key`, Diskless Development Secret Use, metadata-only output, and the copyable First Value Proof.
4. Use the design-partner loop to shorten and harden the First Value proof before widening provider scope or web management.
5. Expand the foundation toward Production Delivery: full Neon Postgres tenant-first schema, tenant-qualified audit log, project ownership by organization, Instance Bootstrap, Bootstrap Operator Claim completion, first-Organization owner Membership creation, Instance Operator-controlled Organization creation, organization/project memberships, and scope-first authorization.
6. Move route shape and authorization to organization-qualified object-level checks.
7. Add organization and project data keys before storing provider credentials or production secrets in multi-tenant mode.
8. Add key versions and root/organization/project data key rotation workflows.
9. Bind the secret ciphertext layer to organization/project/environment/secret identity and bind the DEK-wrap layer to the data-key version with AES-GCM authenticated data.
10. Add the Storage Security Gate from [storage-security-gate.md](storage-security-gate.md) so production Secret Delivery and Secret Sync fail closed until tenant-bound storage readiness is verified.
11. Add Protected Environment Draft Version, Promotion, Published Version, rollback, Rollback Retention Window behavior, and the Protected Change Orchestrator from [protected-change-orchestration.md](protected-change-orchestration.md).
12. Add the Human Approval Surface and Delivery Risk Policy Presets so Protected Environment gates are not terminal-only while non-protected preview/development relaxations are explicit, versioned, and audited.
13. Strengthen secret version write, promotion, and rollback concurrency guarantees.
14. Replace long-lived machine token flows with machine identities, environment-scoped deploy keys, configurable deploy key rotation policies, and short-lived access tokens.
15. Replace scaffold GitHub OAuth with WorkOS AuthKit for human authentication, MFA, and high-risk action challenge behavior.
16. Implement GitHub Actions OIDC federation for short-lived CI access.
17. Add memory/session-only CLI auth and developer-first CLI support for `insecur run <profile-slug-or-id> -- <command>`, dry-runs, operation IDs, runtime injection, and metadata-only JSON output behind the Storage Security Gate.
18. Add the GitHub App connection and Cloudflare scoped-token App Connection, then project-owned secret syncs behind the Storage Security Gate. Keep the Vercel adapter seam add-back-ready, but do not build Vercel sync in V1.
19. Add the [Operation Store](operation-store.md), lease-row Sync Target Serialization with a fencing token, in-request retry with backoff, and the partial-failure state machine (`blocked`/`incomplete`) for sync operations (ADR-0057). Cloudflare Queues and Durable Objects are deferred past V1.
20. Implement the sync lifecycle from `docs/cli-and-sync.md`: connect, create, plan, inline run, verify, retry/reauth, and `incomplete`-operation resume through the Operation Store.
21. Add sync operation audit events for lease claim, Sync Execution Revalidation result, provider write summaries, retry, completion or `incomplete` or cancellation, and lease release.
22. Add tamper-evident audit exports with JSONL hash chains, HMACed manifests, and `audit verify`.
23. Write the security runbooks catalogued in [security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md).
24. Add public onboarding abuse controls, signup lockdown, tenant suspension, quotas, and tenant enumeration tests before broad public signup.
25. Add the security release gate evidence bundle and automation from [security-runbooks-and-release-gates.md](security-runbooks-and-release-gates.md), including ASVS/API Top 10 checks, dependency scanning, and secret scanning.
26. Add the broader focused UI after API, CLI, and sync flows are verified.
