# Project Status

Last updated: 2026-06-12

## Current State

insecur has moved well past the empty scaffold. The repo now has product-bearing package
code for the First Value and Production Delivery foundation, a Worker route surface for
auth/session, onboarding, non-protected secret writes, and Runtime Injection grants, and
the first CLI commands. The main missing pieces are the rest of the user-facing First
Value composition (`insecur secrets set`, `insecur run`, the remaining Worker routes)
and provider sync.

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
Hyperdrive is INS-162 and the approval-gated production migration step is INS-163 (both
ready-for-human). The audit found no other code-vs-ADR contradictions worth acting on; remaining
gaps below are unbuilt pre-V1 work, not divergences.

A 2026-06-12 full spec-corpus review then prepared the docs for the agent-fleet hand-off: 77
confirmed defects were fixed across the spec, ADR, and area-doc corpus (key model, role list,
audit-export, route-shape, and deferral-language drift), and the architecture-improvement pass
landed ADRs 0066 through 0076 plus dated amendments to ADR-0008/0028/0032/0034/0038/0062, the
[custody-material compromise runbook](runbooks/custody-material-compromise.md), and the content
ownership / single-statement / deterministic-conflict rules in
[specs/README.md](specs/README.md) (ADR-0067). Several enforcement gates are now decided but not
yet built: the Plaintext Metadata Allowlist conformance
gate (ADR-0070), the role-bundle registry conformance
suite (ADR-0034) including the machine-only protected-issuance scope (ADR-0038), the
`OPERATION_INTENT_CODES` catalog (ADR-0068), the non-lease execution-deadline liveness recovery
(ADR-0073), and the exit/HTTP
lockstep test (ADR-0062). These contract-and-gate tickets should land before parallel feature
workstreams start, so seam agreements are CI-time facts rather than prose. Review follow-ups are
INS-167 (metadata-viewer role preset) and INS-169 (re-home
First Value routes under `/v1/orgs/:org`).

## Implemented In Code

- `@insecur/domain` owns shared domain primitives: opaque resource IDs, resource ID
  brands, display names, Variable Keys, base64url byte encoding, metadata-only
  envelopes, stable error codes, and request/audit ID generation.
- `@insecur/auth` owns WorkOS-backed human session composition, admitted User actor
  resolution, CSRF helpers, HMAC-signed ephemeral CLI session credentials, request
  credential parsing, auth failure envelopes, and fake WorkOS sessions for tests.
- `apps/worker` exposes `GET /healthz`, `POST /v1/auth/cli/exchange`,
  `GET /v1/session/whoami`, guided-provisioning/onboarding routes, a non-protected
  Blind Secret Write route (`POST .../secrets/by-variable-key`), and Runtime Injection
  Grant issue/consume routes (`POST /v1/runtime-injection/grants`,
  `POST /v1/runtime-injection/grants/:grantId/consume`).
  The secret-write route encrypts through `@insecur/crypto` and the grant-consume route
  decrypts and delivers `valueUtf8`, so live encrypt/decrypt already runs on real
  routes. It validates auth configuration at construction, supports development fake
  sessions, requires CSRF for browser-to-CLI exchange, and returns metadata-only
  success/error envelopes.
  - Custody caveat: live write/decrypt routes now create an ADR-0064 request-scoped
    Keyring from the `INSTANCE_ROOT_KEY_V{n}` Secrets Store bindings and pass it through the
    crypto boundary explicitly. Production root-key bootstrap, escrow evidence, and
    Storage Security Gate sign-off remain pending. Tracked in INS-145/147/149.
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
- The Worker now exposes auth/session, guided-provisioning/onboarding, non-protected
  secret-write, and runtime-injection grant issue/consume routes (the latter two already
  run live encrypt/decrypt, see above). Still missing: instance bootstrap, membership
  management, operations, provider sync, Storage Security Gate enforcement, and audit
  export routes. The custody gap is that the live crypto routes are not yet fed by the
  Cloudflare Secrets Store keyring (INS-145/147/149).
- WorkOS AuthKit is represented through session validation and config composition, but
  hosted login/logout/callback UI, MFA enrollment, and high-risk action challenges are not
  implemented.
- Admitted User resolution in the Worker is still a development JSON map, not persisted
  User admission or production identity configuration.
- Neon/Hyperdrive production bindings are not composed through the Worker yet. Local
  Postgres and the tenant-store connection package are the current persistence path. The
  runtime pool opens directly from `DATABASE_URL_RUNTIME` with no Hyperdrive binding, which
  diverges from ADR-0002/0036; routing it through Hyperdrive is tracked in INS-162.
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

1. Land the contract-and-gate code decided in ADRs 0066-0076 before parallel feature work: the
   intent-code catalog, the role-bundle conformance suite and
   protected-issuance scope atom, the Plaintext Metadata Allowlist registry and gate, and the
   exit/HTTP lockstep test.
   Each is a small ticket; together they turn the cross-workstream seam contracts into CI-time
   facts (see [roadmap.md](roadmap.md) M0).
2. Wire the remaining package implementations into Worker routes: instance bootstrap,
   membership management, and operations (guided provisioning, non-protected secret write,
   and Runtime Injection Grant issue/consume already serve).
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
