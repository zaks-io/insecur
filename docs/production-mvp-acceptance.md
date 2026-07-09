# Production MVP Acceptance

This document is the acceptance contract for deciding whether insecur has reached the actual
production MVP. It composes the product proof, Small-Group Production security baseline, release
gates, and customer evidence into one pass/fail standard an agent can use.

The MVP is not accepted because all planned workstreams are closed, because `pnpm verify` passes, or
because a Worker responds to `/healthz`. The MVP is accepted only when a small trusted team can use
insecur on a real repo to remove plaintext local development secrets and use Protected Environment
values through approved CI, Runtime Injection, and provider sync flows without giving local agents or
ordinary human sessions a read path to Protected Environment Sensitive Values.

## Product Discipline

This doc follows the YC product rule for MVP work: keep the first product narrow, put it in front of
real users, and learn from usage rather than broadening scope before the first wedge works. Michael
Seibel's "How to plan an MVP" and "How to build an MVP" frame the MVP as a small first thing that
delivers value to the first target users, not the full vision. YC's essential startup advice adds the
operating loop: launch, talk to users, iterate, and avoid scaling before users care.

For insecur, that means:

- Do not broaden past the decided V1 reduced spine to make the MVP feel more complete.
- Do not treat internal security evidence as product validation.
- Do not treat customer excitement as permission to skip the security baseline for valuable secrets.
- Prefer one real beachhead workflow that is secure and repeatedly used over a broad secrets manager
  surface.

## MVP Definition

The production MVP is Small-Group Production for the Cloudflare Workers and GitHub Actions beachhead.
It must include:

- Diskless Development Secret Use through the First Value path.
- Tenant-first storage on Hyperdrive-backed Neon Postgres with RLS through the Tenant-Scoped Store.
- WorkOS AuthKit, MFA, scope-first authorization, and Effective Access checks.
- Tenant-bound encryption, key versions, ciphertext identity binding, and no plaintext persistence.
- Storage Security Gate enforcement before production Secret Delivery or Secret Sync.
- Protected Environment Blind Secret Write, Promotion, Human Approval Surface, and High-Assurance
  Challenge behavior.
- Machine Identity and GitHub Actions OIDC or approved environment-scoped deploy keys for protected
  delivery.
- Runtime Injection for local development and approved deploy/runtime workflows.
- Secret Sync to GitHub Actions and Cloudflare Worker secrets, with Cloudflare Worker secret writes
  treated as production deploy impact.
- Tenant-qualified audit, tamper-evident audit export, tested restore evidence, security runbooks,
  supply-chain gates, and production release evidence.

First Value by itself is not the production MVP. It can be a shipped learning release only if the
release is explicitly labeled non-protected development only and not safe for production-grade
Sensitive Values.

## Out Of Scope

These are not required for the production MVP while they remain deferred in `docs/phasing.md`:

- Vercel sync.
- Cloudflare Queues or Durable Objects for sync execution.
- Automated key-rotation scheduler.
- Service Access product surface.
- Staged Change Set / batch publish.
- Multi-approver or Partial Approval behavior beyond add-back-ready seams.
- Full web management parity.
- Broad public hostile-tenant signup.
- Self-hosting.

Secret Reveal or plaintext export for Protected Environment secrets is not deferred scope and is
never promotable through the `docs/phasing.md` procedure. It is a permanent invariant: Protected
Environment secrets never support Secret Reveal, including for owners and Service Access
(`docs/specs/product-spec.md` section 6).

If an agent thinks one of these is required, it must stop and request a scope decision instead of
implementing it as part of MVP acceptance.

## Acceptance States

Use these states in Linear, PR handoff, release notes, and evidence bundles:

| State                          | Meaning                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `blocked`                      | A required control or evidence item is missing, unknown, or failed. Missing evidence is blocking.        |
| `implementation_ready`         | Product behavior and security gates are implemented and verified, but customer evidence is not complete. |
| `customer_validation_ready`    | The release can be used with design partners for production-custody validation.                          |
| `production_mvp_accepted`      | All technical gates and customer evidence in this doc are complete.                                      |
| `not_applicable_with_decision` | A row is excluded by an accepted ADR or explicit docs amendment.                                         |

An agent may move work to `implementation_ready` with evidence. A human owner decides
`production_mvp_accepted` after reviewing customer evidence and production approval evidence.

## Evidence Rules

Every acceptance claim needs a metadata-only evidence bundle. Evidence may be CI run IDs, test
reports, security scan reports, operation IDs, audit export IDs, runbook drill IDs, Linear issue IDs,
PR IDs, ADR links, or customer-validation records.

Evidence must not include Sensitive Values, Provider Credentials, key material, child-process
environments, raw provider bodies, decrypted Sensitive Metadata unless explicitly behind Sensitive
Detail Gate, screenshots containing secrets, or copied terminal output that might contain secrets.

Each evidence item should record:

- `control_id`
- `status`
- `owner`
- `evidence_refs`
- `checked_at`
- `expires_at` when time-sensitive
- `residual_risk`
- `follow_up_issue` when accepted but incomplete follow-up exists

## Blocking Gates

All rows below must be `passed` or `not_applicable_with_decision`.

| Control ID                   | Must Prove                                                                                                                                                                                                                                                                                                                                                                      | Primary Evidence                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scope.v1_spine`             | Built scope matches the V1 reduced spine and does not include deferred scope as product behavior.                                                                                                                                                                                                                                                                               | `docs/phasing.md` review, route/CLI inventory, Linear project audit.                                                                                                                                                                                                    |
| `deploy.production`          | Production Worker deploy runs through approved CI/CD and the protected Production GitHub Environment.                                                                                                                                                                                                                                                                           | CI run IDs, GitHub Environment protection, production smoke results.                                                                                                                                                                                                    |
| `first_value.proof`          | First Value succeeds through normal `init`, `secrets set --generate`, and `run --variable-key` commands.                                                                                                                                                                                                                                                                        | End-to-end hosted proof, CLI JSON snapshots with no Sensitive Values, First Value tests.                                                                                                                                                                                |
| `first_value.no_plaintext`   | First Value does not create plaintext `.env`, local secret files, CLI output, JSON output, logs, or audit.                                                                                                                                                                                                                                                                      | Canary-value scans across local config, logs, audit, operation records, and persistence.                                                                                                                                                                                |
| `auth.human`                 | WorkOS AuthKit, MFA, secure session cookies, CSRF, session rotation, and high-assurance step-up work.                                                                                                                                                                                                                                                                           | Auth/session tests, manual security review, ASVS/API Top 10 mapping.                                                                                                                                                                                                    |
| `auth.agent_boundary`        | Local agents with human session tokens cannot clear High-Assurance Challenges or get Protected grants.                                                                                                                                                                                                                                                                          | Negative CLI/API tests, `auth.high_assurance_required` evidence, audit events.                                                                                                                                                                                          |
| `tenant.isolation`           | Organization/project membership, Effective Access, organization-qualified `/v1/orgs/:org` routes, and denial shape hold. The shipped First Value session-derived by-variable-key secret-write and Runtime Injection grant routes are re-homed under `/v1/orgs/:org` before this gate passes; onboarding routes stay session-derived by recorded exception (ADR-0003 amendment). | Cross-tenant authorization tests and route inventory.                                                                                                                                                                                                                   |
| `tenant.rls`                 | Tenant-Scoped Store uses real Postgres RLS as the `NOBYPASSRLS` runtime role, with no raw executor escape.                                                                                                                                                                                                                                                                      | Docker Compose Postgres RLS tests, migration review, store tests, runtime-role guard.                                                                                                                                                                                   |
| `storage.gate`               | Storage Security Gate passes all readiness controls and production delivery checks it immediately.                                                                                                                                                                                                                                                                              | Gate verdict, keyring/store/envelope tests, delivery-path instrumentation.                                                                                                                                                                                              |
| `storage.no_plaintext`       | Insecur-controlled durable surfaces never store Sensitive Values, Provider Credentials, or key material.                                                                                                                                                                                                                                                                        | `pnpm test:canary` for the enumerated surfaces (Postgres columns, operation records, audit rows, in-process console output) plus registered sweep adapters for R2, caches, traces, and backups ([ADR-0069](adr/0069-no-plaintext-canary-gate.md)).                      |
| `crypto.binding`             | Secret, Provider Credential, and Sensitive Metadata ciphertext cannot be replayed or mis-bound.                                                                                                                                                                                                                                                                                 | Ciphertext swap tests, AAD tests, key-version tests, rotation tests.                                                                                                                                                                                                    |
| `protected.change`           | Protected Draft Versions, Promotion, Approval Requests, stale closures, rollback, and discard rules hold.                                                                                                                                                                                                                                                                       | Protected Change Orchestrator tests and audit evidence.                                                                                                                                                                                                                 |
| `approval.human_surface`     | Protected approval and High-Assurance Challenge completion happen in the authenticated web app, not CLI only.                                                                                                                                                                                                                                                                   | Web approval tests, terminal-only denial tests, notification metadata review.                                                                                                                                                                                           |
| `runtime.protected_delivery` | Protected Runtime Injection requires Machine Identity custody and exact Runtime Injection Policy versions.                                                                                                                                                                                                                                                                      | OIDC/deploy-key tests, Injection Grant issue/consume tests, negative human-session tests.                                                                                                                                                                               |
| `sync.github`                | GitHub Actions Secret Sync works for configured targets and protected syncs target protected environments.                                                                                                                                                                                                                                                                      | Provider adapter tests, exact lookup evidence, sync operation IDs, audit events.                                                                                                                                                                                        |
| `sync.cloudflare`            | Cloudflare Worker secret writes label exact Worker scripts and binding names as production deploy impact.                                                                                                                                                                                                                                                                       | Plan/approval/status/audit output, provider write tests, production deploy impact evidence.                                                                                                                                                                             |
| `sync.fail_closed`           | Production Secret Sync blocks before decrypt/write when storage, provider, approval, or lookup gates fail.                                                                                                                                                                                                                                                                      | Denial tests with stable error codes and audit events.                                                                                                                                                                                                                  |
| `operation.store`            | Long-running sync, rotation, backup, restore, and reauth operations are durable, resumable, and metadata-only.                                                                                                                                                                                                                                                                  | Operation Store tests, retry/resume tests, incomplete-operation tests.                                                                                                                                                                                                  |
| `audit.integrity`            | Tenant-qualified audit events exist for allowed and denied actions, and audit export verification passes.                                                                                                                                                                                                                                                                       | Audit tests, `insecur audit verify`, hash-chain and manifest evidence, Ed25519 signature verification against the published public key (ADR-0045).                                                                                                                      |
| `backup_restore.drill`       | Encrypted backup and one full restore drill can decrypt a recovery canary in a fresh environment, and `backup_restore.export_fresh` holds: the latest successful export is under 48h old in the `small_group_production` profile ([ADR-0072](adr/0072-backup-export-pipeline-and-freshness.md)).                                                                                | Restore runbook drill, measured restore report, canary verification, latest-export freshness evidence.                                                                                                                                                                  |
| `runbook.catalog`            | Runbooks required by the `small_group_production` profile exist, have dry-run/execute/verify sections, and critical drills have evidence; runbooks tiered to higher profiles become blocking when that profile's gate is exercised ([ADR-0008](adr/0008-security-gates-and-runbooks.md)).                                                                                       | Runbook review and drill IDs.                                                                                                                                                                                                                                           |
| `supply_chain.ci`            | Validate, dependency scanning, secret scanning, SBOM/vulnerability checks, and branch protection are active.                                                                                                                                                                                                                                                                    | CI run IDs, scanner reports, branch protection settings.                                                                                                                                                                                                                |
| `telemetry.safe`             | Logs, telemetry, traces, analytics, and error output are secret-free and metadata-only by default.                                                                                                                                                                                                                                                                              | Telemetry allowlist review; `pnpm test:canary` for the enumerated surfaces (Postgres columns, operation records, audit rows, in-process console output) plus registered sweep adapters for the rest ([ADR-0069](adr/0069-no-plaintext-canary-gate.md)), log inspection. |
| `docs.truth`                 | Setup, README, product status, and agent docs do not claim unsupported product readiness or unsafe modes.                                                                                                                                                                                                                                                                       | Docs review and route/CLI inventory.                                                                                                                                                                                                                                    |

## Product Acceptance

The MVP is not accepted until customer evidence proves that the wedge matters. The design-partner
evidence must stay within the beachhead in `docs/customer-validation.md`.

Minimum product evidence:

- At least five design partners from the target audience have been manually supported.
- At least one design partner uses the hosted product on a real agent-touched repo for two weeks.
- At least one real `.env` or equivalent local plaintext secret file is removed from a repo because
  the product replaced it.
- A design partner runs `insecur run` multiple times in normal work without prompting from the team.
- A design partner asks for staging or production custody, or agrees to pay for production custody,
  before broad enterprise features exist.
- The team records what confused users, what made them trust the product, and what caused repeated
  usage or drop-off.

Weak signals do not satisfy this gate: positive demo feedback, waitlist signups, broad platform
requests, investor interest, or "security would like this" without an active developer user.

## Acceptance Scenarios

### First Value Hosted Proof

An admitted User starts with no project-specific setup beyond authentication. Guided Organization
Provisioning creates the Personal Organization, Default Team, owner Membership, first Project, and
non-protected development Environment. The user runs:

```sh
insecur init
insecur secrets set INSECUR_PROOF_SECRET --generate random --length 32
insecur run --variable-key INSECUR_PROOF_SECRET -- node examples/first-value-proof/verify.mjs
```

Pass means the verifier succeeds, output is metadata-only, local config contains only Opaque Resource
IDs, no plaintext file is written, and audit events exist for provisioning, write, grant issue, grant
consume, and any denied attempts.

### Protected Production Delivery

A protected production Secret is written as a Draft Version, reviewed through a Promotion Change Set,
approved in the Human Approval Surface with a High-Assurance Challenge, promoted to a Published
Version, then delivered through at least one protected Runtime Injection path and one enabled
Cloudflare or GitHub Secret Sync.

Pass means the local agent cannot approve the request, cannot obtain a Protected Environment
Injection Grant with a human session token, and cannot read the Protected Environment Sensitive Value
through product output. The approved machine path can use the value only through the exact policy or
sync that was reviewed and audited.

### Fail-Closed Production Delivery

For each required production gate, intentionally remove or invalidate one readiness fact in a safe
test environment: Storage Security Gate evidence, provider credential encryption, GitHub Environment
protection, approval state, machine credential scope, key version, or tenant scope.

Pass means delivery blocks before decrypt or provider write, returns a stable machine-readable error,
records metadata-only audit evidence, and does not create partial live state except through the
documented `incomplete` operation model.

### Restore And Audit Proof

Create an encrypted backup, restore it into a fresh environment, load the escrowed root key through
the approved path, and decrypt only the recovery canary. Export tenant audit history and verify the
hash chain, the HMACed manifest, and the Ed25519 signature against the published public key
(ADR-0045).

Pass means the canary verifies, restore time is recorded, no Protected Environment Secret Reveal path
is created, and audit verification succeeds without exposing Sensitive Values.

### Design Partner Proof

A design partner removes local plaintext development secrets from one real repo and uses Runtime
Injection repeatedly in normal work.

Pass means the repo no longer depends on a steady-state plaintext `.env` for the chosen workflow, the
team can explain "secrets my agents never have to hold" in their own words, and their feedback
identifies the next highest-confidence production-custody workflow.

## Done

The production MVP is done only when all of the following are true:

- Every Blocking Gate row is `passed` or `not_applicable_with_decision`.
- Every Acceptance Scenario has current metadata-only evidence.
- `small_group_production` and `production_deploy` release gates return `passed`.
- The Storage Security Gate returns `passed` for production delivery scopes and fails closed when
  evidence is missing or unknown.
- Production Worker deploy, protected Runtime Injection, GitHub Actions sync, Cloudflare Worker sync,
  audit verify, and restore drill have all succeeded against production or a production-equivalent
  release environment as specified by the relevant runbook.
- Product Acceptance evidence is complete and reviewed by a human owner.
- `docs/project-status.md`, `docs/setup.md`, and public-facing docs have been updated to accurately
  describe the supported product state and remaining limitations.
- No acceptance evidence contains Sensitive Values or other forbidden secret-bearing material.

If any item is missing, the correct state is `blocked` or `implementation_ready`, not
`production_mvp_accepted`.
