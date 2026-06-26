# Project Status

Last updated: 2026-06-26

This document is a **status snapshot** — what was built, verified, and still open when it was last
edited. It is not normative product truth. When this prose disagrees with an owning spec, ADR, or
verified code, follow the owner and treat this file as the defect (see the Source Of Truth Rules in
[specs/README.md](specs/README.md)). For the authoritative route → deploy table, use
[specs/deploy-route-inventory.md](specs/deploy-route-inventory.md) instead of restating routes here.

## Current State

insecur has moved well past the empty scaffold. The repo now has product-bearing package
code for the First Value and Production Delivery foundation, capability-isolated Worker deploys
(`apps/api` + `apps/runtime`), a public route surface for auth/session, onboarding, instance
bootstrap, membership/invitations, operations, non-protected secret writes, and Runtime Injection
grants, plus the first CLI commands. The main missing pieces are the rest of the user-facing First
Value composition (`insecur secrets set`, `insecur run`, the remaining CLI/proof path), the
`apps/web` BFF deploy (INS-201), production Hyperdrive on the API Worker for its DB-backed public
routes (INS-212), and provider sync.

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

A recent seam-deepening pass (the `ARCH-0`/`ARCH-1` epics, INS-115 through INS-127)
collapsed shallow modules, sealed the Encryption Envelope internals, unified package
failures on ErrorBody-compatible codes, and tightened onboarding/operations/runtime-injection
audit behavior. A follow-up architecture review (epic INS-133, `ARCH-2`) is now open and
holds the verified trailing test-surface and duplication work: accept-side invitation
denial-audit coverage (INS-134), `resolveUserActor` admission re-check tests (INS-135),
making CSRF unconditional in `exchangeCliSession` (INS-136), centralizing the Postgres
`23505` check (INS-137), homing the Stable Dotted Code validator in `@insecur/domain`
(INS-138), and `MetadataTenantDataKeySource` invalid-key coverage (INS-139). Related open
dedup tickets INS-130 and INS-132 consolidate the per-package denial-audit builders. None of
these block First Value wiring; they harden seams already in code.

The same `ARCH-2` review opened the Drizzle restoration (INS-155): ADR-0037 says Drizzle owns the
schema and a raw SQL step owns the RLS policies and roles, but the data layer was hand-written
`postgres.js` with no Drizzle. The restoration is complete: tooling (INS-156), the ADR-0037
footnote (INS-157), the schema cutover (INS-158), and the query-builder rewrite (INS-159) have all
landed.

A 2026-06-03 ADR-conformance audit then checked all 60 accepted ADRs against the code. Beyond the
Drizzle drift above (since closed), it produced four new tickets; the RLS CI gate (INS-144) is
wired in `postgres-integration`. The data-key model is HKDF-derived rather than wrapped, so
ADR-0005 and ADR-0028 were amended (2026-06-03) to make organization/project data keys random keys
stored AES-GCM wrapped under the root in `wrapped_storage_ref`, with rotation rewrapping the blob
and never decrypting a value; the keyring conversion plus the rewrap primitive is INS-160, still
open. The ESLint test-file override relaxing
`complexity`/`max-statements` beyond ADR-0055 landed as INS-161. Routing the runtime pool through
Hyperdrive was INS-162 (now composed on `apps/runtime`; API Worker adapter is INS-212) and the
approval-gated production migration step is INS-163 (ready-for-human). The audit found no other code-vs-ADR contradictions worth acting on; remaining
gaps below are unbuilt pre-V1 work, not divergences.

A 2026-06-12 full spec-corpus review then prepared the docs for the agent-fleet hand-off: 77
confirmed defects were fixed across the spec, ADR, and area-doc corpus (key model, role list,
audit-export, route-shape, and deferral-language drift), and the architecture-improvement pass
landed ADRs 0066 through 0076 plus dated amendments to ADR-0008/0028/0032/0034/0038/0062, the
[custody-material compromise runbook](runbooks/custody-material-compromise.md), and the content
ownership / single-statement / deterministic-conflict rules in
[specs/README.md](specs/README.md) (ADR-0067). The M0 contract-and-gate batch from ADRs 0062 and
0066–0073 is blocking in CI: the Plaintext Metadata Allowlist conformance gate (ADR-0070),
the role-bundle registry conformance suite (ADR-0034) including the machine-only
protected-issuance scope (ADR-0038), the `OPERATION_INTENT_CODES` catalog (ADR-0068), the
`operation.idempotency_mismatch` check (ADR-0066), the no-plaintext canary gate `pnpm test:canary`
(ADR-0069), the exit/HTTP lockstep test (ADR-0062), the decrypt-import lint boundary
(ADR-0071), and non-lease `execution_deadline` claims with lazy abandonment recovery
(ADR-0073, landed INS-219). Review follow-ups are
INS-167 (metadata-viewer role preset) and INS-169 (re-home
First Value routes under `/v1/orgs/:org`).

## Implemented In Code

- `@insecur/domain` owns shared domain primitives: opaque resource IDs, resource ID
  brands, display names, Variable Keys, base64url byte encoding, metadata-only
  envelopes, stable error codes, and request/audit ID generation.
- `@insecur/auth` owns WorkOS-backed human session composition, admitted User actor
  resolution, CSRF helpers, HMAC-signed ephemeral CLI session credentials, request
  credential parsing, auth failure envelopes, and fake WorkOS sessions for tests.
- `apps/api` (public API Worker, `insecur-api`) exposes the public `/v1/*` route groups listed in
  [deploy-route-inventory.md](specs/deploy-route-inventory.md): `GET /healthz`, auth/session,
  onboarding, instance bootstrap, org-scoped invitations/organizations/projects/operations, and
  runtime-injection grant issue/consume. It holds no keyring: secret-write and grant-consume forward
  to `RUNTIME.writeSecret` / `RUNTIME.consumeGrant` over the private Service Binding, so live
  encrypt/decrypt runs in the Runtime Worker. It deliberately binds no Hyperdrive (DB I/O for
  keyring-bound work is Runtime-side; see Hyperdrive notes below). It validates auth configuration
  at construction, supports development fake sessions, requires CSRF for browser-to-CLI exchange, and
  returns metadata-only success/error envelopes.
- `apps/runtime` (private Runtime Worker, `insecur-runtime`) is the sole holder of
  `INSTANCE_ROOT_KEY_V1` and the only place decryption happens. It serves no public routes;
  its `RuntimeService` RPC entrypoint (`consumeGrant`, `writeSecret`) is reachable only over
  the private `RUNTIME` Service Binding. Authorization and decryption are one indivisible
  call inside it (ADR-0034).
  - Custody caveat: the Runtime Worker creates an ADR-0064 request-scoped Keyring from the
    `INSTANCE_ROOT_KEY_V{n}` Secrets Store bindings and passes it through the crypto boundary
    explicitly. Production root-key bootstrap, escrow evidence, and Storage Security Gate
    sign-off remain pending. Tracked in INS-145/147/149.
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
- `@insecur/secret-store` owns non-protected Blind Secret Write and Secret Version Store
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
  leases, renew/release, fencing tokens, stale-token rejection, target-busy errors,
  non-lease `execution_deadline` claims, and lazy abandonment recovery (ADR-0073).
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
- `pnpm test:rls` is the real-Postgres RLS gate (`ENABLE` + `FORCE ROW LEVEL SECURITY`,
  `NOBYPASSRLS` runtime role). The `postgres-integration` CI job resets Docker Compose
  Postgres 17, asserts migration vs runtime credentials and `NOBYPASSRLS`, then runs
  `test:rls` (`@insecur/tenant-store` forced-RLS suite plus `@insecur/access` integration
  RLS tests), `test:e2e`, and `test:canary` with `INSECUR_CI_RLS_GATE=1` so skipped suites fail the build.
  Package integration suites outside those tasks still self-gate in `pnpm verify` when
  `DATABASE_URL_RUNTIME` is unset.
- The third test layer is the gated preview smoke (`pr-preview.yml`, INS-164): the First
  Value smoke against a deployed preview Worker, off until `PREVIEW_ENV_ENABLED` flips.

## Not Yet Wired

- The CLI has its first commands (INS-31): `insecur login`, `insecur init`, and
  `insecur shell` (which already spawns a child process with injected env), plus local
  profile resolution, user/project config, and `--json` output. Still missing:
  `insecur secrets set`, `insecur run <command>`, the masked prompt, and the first-value
  proof command path.
- The API Worker now exposes the public route groups in
  [deploy-route-inventory.md](specs/deploy-route-inventory.md). Still missing at the product
  layer: provider sync, Storage Security Gate enforcement, audit export routes, and the
  `apps/web` BFF (INS-201). The custody gap is that production root-key bootstrap, escrow
  evidence, and Storage Security Gate sign-off remain pending (INS-145/147/149).
- WorkOS AuthKit is represented through session validation and config composition, but
  hosted login/logout/callback UI, MFA enrollment, and high-risk action challenges are not
  implemented.
- Admitted User resolution in the Worker is still a development JSON map, not persisted
  User admission or production identity configuration.
- **Worker topology is capability-isolated (INS-194 Cut 1 landed).** The former monolith
  `apps/worker` is split into `apps/api` (public API Worker, `insecur-api`, no keyring) and
  `apps/runtime` (private Runtime Worker, `insecur-runtime`, sole `INSTANCE_ROOT_KEY_V1` holder, no
  public routes, reached only over a private Service Binding via the `RuntimeService`
  `WorkerEntrypoint` RPC seam). Shared composition glue lives in `packages/worker-kit`. **No deploy
  holds both a public route and the root-key binding**, enforced by `pnpm conformance:topology`
  (`scripts/ci/deploy-topology-conformance.mjs`) plus the lint keyring boundary, both in `pnpm
verify`. Do not compose new routes into a single worker; every route belongs to a specific deploy
  by capability per [deploy-route-inventory.md](specs/deploy-route-inventory.md). `apps/web` (Web
  Console BFF, `insecur-web`) is Cut 2 (INS-201) and is not scaffolded yet; Service Access stays a
  deferred deploy with a negative conformance assertion (ADR-0019). Epic: INS-194 (slices INS-195..201).
- **Hyperdrive bindings (partial).** `apps/runtime` composes a Hyperdrive `DB` binding in
  `wrangler.jsonc` and reads Postgres via `env.DB.connectionString` at RPC entry (with
  `DATABASE_URL_RUNTIME` fallback for local/CI/tests). `apps/api` deliberately binds no Hyperdrive:
  keyring-bound persistence is Runtime-side over the `RUNTIME` Service Binding. DB-backed public
  routes on the API Worker still rely on the `DATABASE_URL_RUNTIME` fallback path in tests and need a
  production Hyperdrive adapter on the API deploy (INS-212). Preview `env.preview` Hyperdrive
  scaffolds exist on the Runtime deploy for the gated `pr-preview` workflow (INS-164).
- Root key custody is partially wired through request-scoped Cloudflare Secrets Store
  keyring construction. Production bootstrap, escrow evidence, and Storage Security Gate
  sign-off are still pending.
- Key rotation workflows are not implemented. Version metadata and readiness checks exist,
  but rotation operations, rewrap workflows, and operator UX do not. The data-key model is
  also still HKDF-derived rather than wrapped: ADR-0005/0028 (2026-06-03 amendments) decide
  that organization/project data keys are random keys stored AES-GCM wrapped under the root in
  `wrapped_storage_ref`, so rotation can rewrap without decrypting values. Converting the keyring
  off derivation and adding the rewrap primitive is tracked in INS-160.
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
[phasing.md](phasing.md), production readiness is governed by
[production-mvp-acceptance.md](production-mvp-acceptance.md), and milestone sequencing for the
fleet hand-off is [roadmap.md](roadmap.md).

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

**Promotion Approval And High-Assurance Challenges**

Add the core Protected Environment Promotion approval state machine, High-Assurance Challenges,
protected delivery configuration change approvals, and versioned Delivery Risk Policy Presets.
This block lands before provider sync: protected Secret Sync enable/run and Cloudflare Worker
secret writes stay fail-closed until these approval gates exist, because the accepted Approval
Impact Review is the approval evidence for Cloudflare Worker Secret Deploys
([ADR-0039](adr/0039-cloudflare-worker-secrets-sync-target.md)).

**Provider Sync: GitHub And Cloudflare**

Build App Connections and inline sync adapters on top of the Operation Store and sync target
lease/fencing primitives. The sync-specific approval surfaces — Approval Impact Review sync
impact, protected Secret Sync enable/run approvals, and Cloudflare Worker Secret Deploy approval
evidence — land alongside this block. Cloudflare Worker secret writes remain production deploys
for the affected script/environment and need approval and audit evidence (ADR-0039).

**Audit, Runbooks, And Release Gates**

Add tamper-evident audit exports, `audit verify`, tested restore evidence, security runbooks,
ASVS/API Top 10 checks, dependency scanning, secret scanning, SBOM/vulnerability scanning, and
release-gate evidence bundles.

## Recommended Next Steps

1. Close the custody/persistence gaps ticketed in [roadmap.md](roadmap.md) M0 before parallel
   feature work depends on them. The ADR-0073 non-lease execution-deadline/lazy-abandonment gate
   landed in INS-219; see [operation-store.md](operation-store.md) and
   `packages/operations/CONTEXT.md` for the owner contract.
2. Wire remaining package implementations into the correct deploy (INS-194 Cut 1 landed). The
   decided topology is `apps/api` (public edge, no keyring), `apps/runtime`
   (sole `INSTANCE_ROOT_KEY_V1` holder, decrypt-egress behind a `WorkerEntrypoint` RPC seam, no
   public routes), and `apps/web` (BFF, INS-201, not scaffolded yet). Route mounts are owned by
   [deploy-route-inventory.md](specs/deploy-route-inventory.md). Secret write and grant consume are
   keyring routes executed Runtime-side; other public routes land on `apps/api`. No deploy may hold
   both a public route and the root key (CI gate INS-199).
3. Finish the CLI First Value path on top of the landed `login`/`init`/`shell` commands
   (INS-31): masked safe secret input, metadata-only `secrets set`, and one-command `run` with
   child-process env injection without local secret files.
4. Run `pnpm dev:db:reset && pnpm test:rls` before treating the DB-backed integration suites as
   current evidence.
5. Convert the First Value Proof in `examples/first-value-proof` from standalone proof script to
   a real CLI/API integration proof once the CLI and routes exist.
6. Add production identity persistence and replace the Worker development admitted-user JSON map.
7. Add root-key custody through the intended Cloudflare Secrets Store path and enforce key
   readiness before secret writes or runtime delivery.
8. Keep provider sync and protected delivery behind the Storage Security Gate until tenant-bound
   storage, authorization, audit, and key readiness are all composed through routes.
9. Burn down the `ARCH-2` hardening backlog (epic INS-133) opportunistically alongside First
   Value wiring. The slices are scoped to one PR each, carry mutation-based acceptance checks,
   and are independent except INS-135/INS-136 (both touch `packages/auth`, different files).
