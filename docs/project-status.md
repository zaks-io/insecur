# Project Status

Last updated: 2026-06-02

## Current State

insecur has moved well past the empty scaffold. The repo now has product-bearing package
code for the First Value and Production Delivery foundation, plus a Worker auth/session
surface. The main missing piece is composition into the full user-facing First Value
flow: CLI commands, Worker routes for provisioning/secrets/runtime injection, and
provider sync are not wired yet.

The current workspace is Node 24 and pnpm 10, with Turbo, Prettier, ESLint, Vitest,
package builds, local Postgres development scripts, RLS migrations, Blacksmith-backed
CI workflows, gitleaks config, and daily security scan workflow files. `pnpm verify`
passes on this worktree across the current app/package graph.

The accepted implementation direction is still Diskless Development Secret Use first:
developers and agents should use non-protected development secrets through Runtime
Injection without creating plaintext local secret files. Production delivery remains
behind the Storage Security Gate and the Small-Group Production baseline.

The GitHub repository is `zaks-io/insecur`, and Linear team `INS` is the tracker. First
Value implementation still follows [first-value-ticket-plan.md](specs/first-value-ticket-plan.md)
and the milestone contract in [first-value-milestone.md](first-value-milestone.md).

## Implemented In Code

- `@insecur/domain` owns shared domain primitives: opaque resource IDs, resource ID
  brands, display names, Variable Keys, base64url byte encoding, metadata-only
  envelopes, stable error codes, and request/audit ID generation.
- `@insecur/auth` owns WorkOS-backed human session composition, admitted User actor
  resolution, CSRF helpers, HMAC-signed ephemeral CLI session credentials, request
  credential parsing, auth failure envelopes, and fake WorkOS sessions for tests.
- `apps/worker` exposes `GET /healthz`, `POST /v1/auth/cli/exchange`, and
  `GET /v1/session/whoami`. It validates auth configuration at construction,
  supports development fake sessions, requires CSRF for browser-to-CLI exchange, and
  returns metadata-only success/error envelopes.
- `@insecur/tenant-store` owns the Postgres persistence seam: scoped transactions,
  transaction-local tenant scope, runtime connection handling, local migration scripts,
  runtime-role grants, and RLS helper scripts/tests.
- Tenant-store migrations now create the First Value metadata spine: instances,
  organizations, projects, environments, teams, memberships, organization/project data
  key metadata, secrets, secret versions, injection grants, audit events, operations,
  instance bootstrap tables, invitations, and sync target leases. Tenant-owned tables
  have RLS enabled and forced.
- `@insecur/access` owns Effective Access resolution, built-in role presets, First
  Value owner scopes, request-level memoization/cache behavior, project/org coordinate
  filtering, scope checks, and access-denied audit recording.
- `@insecur/audit` owns tenant-qualified, metadata-only audit event validation and
  writing, including stable denied-result codes and payload allowlist checks that fail
  closed on sensitive-looking keys or binary payloads.
- `@insecur/crypto` owns the keyring and encryption envelope below domain workflows:
  root-key runtime configuration, organization/project data key metadata resolution,
  key readiness reports, AES-GCM envelope behavior, ciphertext identity binding, DEK
  wrap AAD, and opaque decrypt failures.
- `@insecur/secrets` owns non-protected Blind Secret Write and Secret Version Store
  behavior: safe value ingress policy, UTF-8 and 64 KiB value validation, Variable Key
  validation, append/current-version persistence, wrapped-material storage, metadata-only
  write results, and denied write audit.
- `@insecur/runtime-injection` owns server-side one-use Injection Grant behavior:
  exact secret selectors, issue/consume flows, grant TTL, secret-version binding at issue
  time, decrypt-for-runtime path, denied issue/consume audit, and metadata-only grant
  results.
- `@insecur/onboarding` owns Guided Organization Provisioning and early membership
  management: Personal Organization, Default Team, owner Membership, first Project,
  non-protected development Environment, operator-created Organizations, invitations,
  project-scoped invitation acceptance, and related audit events.
- `@insecur/instance-bootstrap` owns initial instance setup and Bootstrap Operator Claim
  completion: instance posture/config rows, WorkOS-ready identity configuration,
  bootstrap secret verifier hashing, pending claim CAS, first Organization owner grant,
  Instance Operator grant, bootstrap status, and rollback on failed post-grant audit.
- `@insecur/operations` owns the Operation Store and sync target serialization core:
  operation create/transition/progress/retry/cancel/poll, metadata-safe operation
  progress, `blocked` and `incomplete` resume semantics, sync target key validation,
  leases, renew/release, fencing tokens, stale-token rejection, and target-busy errors.
- Package failures have been aligned around ErrorBody-compatible stable codes where the
  package surface exposes failures to Worker/API callers.

## Verified Locally

- `pnpm verify` passes as of 2026-06-02. It ran `pnpm format:check` and Turbo
  `lint`, `typecheck`, and `test` across 59 tasks.
- Worker auth/session tests pass, including unauthenticated/invalid/expired credential
  responses, valid bearer `whoami`, and WorkOS-browser-session-to-CLI credential exchange.
- Package unit tests pass for domain primitives, auth, access role/scope logic, audit
  metadata allowlists, crypto envelope/AAD/readiness behavior, secret input validation,
  runtime injection metadata/selector rules, operation state/metadata rules, and bootstrap
  secret/authenticated-actor checks.
- DB-backed integration tests are present for tenant isolation, data-key isolation,
  access resolution, audit writes, non-protected secret writes, runtime injection grants,
  guided provisioning, membership management, instance bootstrap, operation store, and
  sync target leases. In ordinary `pnpm verify`, suites that need `DATABASE_URL_RUNTIME`
  are skipped when the runtime DB is not configured.
- `pnpm test:rls` remains the real-Postgres RLS gate. Use it with the local Postgres
  reset flow or per-PR Neon runtime role before treating RLS behavior as freshly verified.

## Not Yet Wired

- The CLI package is still an empty entrypoint. No `insecur login`, `insecur secrets set`,
  `insecur run`, local profile config, child process spawning, masked prompt, JSON output,
  or first-value proof command path exists yet.
- The Worker exposes auth/session routes only. There are no HTTP routes yet for instance
  bootstrap, guided provisioning, membership management, secret writes, runtime injection
  grant issue/consume, operations, provider sync, Storage Security Gate, or audit export.
- WorkOS AuthKit is represented through session validation and config composition, but
  hosted login/logout/callback UI, MFA enrollment, and high-risk action challenges are not
  implemented.
- Admitted User resolution in the Worker is still a development JSON map, not persisted
  User admission or production identity configuration.
- Neon/Hyperdrive production bindings are not composed through the Worker yet. Local
  Postgres and the tenant-store connection package are the current persistence path.
- Root key custody and Cloudflare Secrets Store integration are not implemented. Crypto
  has root-key runtime configuration and tenant data-key metadata behavior, but production
  custody/escrow wiring is still pending.
- Key rotation workflows are not implemented. Version metadata and readiness checks exist,
  but rotation operations, rewrap workflows, and operator UX do not.
- Protected Environments, Draft/Published Version, Promotion, rollback, Protected Change
  Orchestrator, Human Approval Surface, Delivery Risk Policy Presets, and Storage Security
  Gate enforcement are not implemented.
- Machine Identity, GitHub Actions OIDC, environment-scoped deploy keys, deploy-key
  rotation, and short-lived CI access tokens are not implemented.
- Provider App Connections and Secret Sync adapters for GitHub Actions and Cloudflare
  Worker secrets are not implemented. Operation Store and sync target lease primitives
  exist, but provider connect/plan/write/verify flows do not.
- Tamper-evident audit export, JSONL hash chains, HMACed manifests, `audit verify`, backup
  and restore evidence, and breach forensic records are not implemented.
- Public signup controls, signup lockdown, quotas, tenant suspension, abuse handling, and
  tenant enumeration defenses are not implemented.
- No web console UI exists.

## Product Boundary

The removed pre-V1 scaffold remains disposable learning code. It is not a supported product
mode and should not be treated as evidence of intended product behavior. Current work must
continue through the package seams above.

The First Value Milestone can prove the non-protected development loop before production
delivery is ready. It is not safe for production-grade Sensitive Values. Production delivery
must meet the Small-Group Production baseline before storing or delivering valuable secrets:
tenant-qualified storage, membership and role authorization, tenant-bound keys, no-reveal
secret custody, protected delivery policy, machine access, app connections, tenant-bounded
audit, controlled Organization creation, and invitation-based Organization access.

## Build Order

This is dependency order, not a release plan. Version boundaries are still governed by
[phasing.md](phasing.md), and production readiness is governed by
[production-mvp-acceptance.md](production-mvp-acceptance.md).

**First Value Completion**

Wire the existing packages into the usable First Value path: instance/admitted-user setup,
guided Personal Organization provisioning, non-protected development secret write, one-use
Runtime Injection Grant issue/consume, CLI profile defaults, `insecur run`, metadata-only
output, and the copyable First Value Proof.

**Production Delivery Foundation**

Finish Worker composition, persisted identity/admission behavior, production Postgres/Hyperdrive
binding, root-key custody, key readiness enforcement, Storage Security Gate checks, protected
environment modeling, route-level authorization, and tenant-qualified audit coverage.

**Machine Access And CI Trust**

Add Machine Identities, GitHub Actions OIDC, environment-scoped deploy keys, rotation policy,
and short-lived automation access for scoped Runtime Injection without broad long-lived tokens.

**Provider Sync: GitHub And Cloudflare**

Build App Connections and inline sync adapters on top of the Operation Store and sync target
lease/fencing primitives. Cloudflare Worker secret writes remain production deploys for the
affected script/environment and need approval and audit evidence.

**Approval UX And Delivery Policy**

Add Protected Environment approval, high-assurance challenges, protected delivery configuration
change approvals, protected Secret Sync enable/run approvals, Cloudflare Worker Secret Deploy
approval evidence, and versioned Delivery Risk Policy Presets.

**Audit, Runbooks, And Release Gates**

Add tamper-evident audit exports, `audit verify`, tested restore evidence, security runbooks,
ASVS/API Top 10 checks, dependency scanning, secret scanning, SBOM/vulnerability scanning, and
release-gate evidence bundles.

## Recommended Next Steps

1. Wire the existing package implementations into Worker routes for instance bootstrap,
   guided provisioning, non-protected secret write, and Runtime Injection Grant issue/consume.
2. Implement the CLI First Value path: profile config, safe secret input, metadata-only
   `secrets set`, one-command `run`, and child-process env injection without local secret files.
3. Run `pnpm dev:db:reset && pnpm test:rls` before treating the DB-backed integration suites as
   current evidence.
4. Convert the First Value Proof in `examples/first-value-proof` from standalone proof script to
   a real CLI/API integration proof once the CLI and routes exist.
5. Add production identity persistence and replace the Worker development admitted-user JSON map.
6. Add root-key custody through the intended Cloudflare Secrets Store path and enforce key
   readiness before secret writes or runtime delivery.
7. Keep provider sync and protected delivery behind the Storage Security Gate until tenant-bound
   storage, authorization, audit, and key readiness are all composed through routes.
