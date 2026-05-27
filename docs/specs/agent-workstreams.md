# Agent Workstreams

This document breaks the decided product into implementation groups that autonomous agents can own
without stepping on each other. Each workstream owns a small set of seams. Anything outside those
seams is a dependency or a downstream consumer, not a place to improvise.

## Global Rules For All Agents

- Start from [product-spec.md](product-spec.md), then read only the ADRs and area docs linked from
  your workstream.
- Use `CONTEXT.md` names exactly. Do not invent synonyms for domain objects.
- Every route, service, and CLI command uses Opaque Resource IDs at the server boundary. Display
  Names are presentation or client-side scoped resolution only.
- No raw SQL executor leaves the Tenant-Scoped Store.
- No route branches on actor type, Role name, or "owner" shortcuts. Ask the Effective Access
  Resolver for scopes.
- No Sensitive Value appears in logs, audit metadata, telemetry, JSON output, screenshots, test
  names, fixtures committed to git, or agent-facing prose.
- Protected Environment delivery fails closed until the Storage Security Gate passes.
- First Value work uses the real seams in [first-value-milestone.md](../first-value-milestone.md);
  do not add an unsafe onboarding, storage, auth, or CLI shortcut.
- When a workstream needs a new decision, write or amend an ADR, then update the specs before
  continuing.

## Shared Seams

These are the seams agents should integrate through instead of sharing internals:

| Seam                            | Owner                   | Contract                                                                                                                                                 |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First Value Milestone Contract  | W2/W4/W5 with W1/W3/W10 | Provider-free non-protected development Secret Use through the real tenant, access, storage, crypto, Secret Version, Runtime Injection, and audit seams. |
| Tenant-Scoped Store             | W1                      | Short scoped transaction, tenant-local RLS setting, no raw executor, audit-safe typed data access.                                                       |
| Effective Access Resolver       | W2                      | Actor plus Organization/Project/Environment IDs in, coordinate-bound Authorization Scope set out.                                                        |
| Keyring                         | W3                      | Resolve and rewrap key hierarchy without exposing tenant keys to callers.                                                                                |
| Encryption Envelope             | W3                      | Domain identity plus plaintext in, wrapped material out; decrypt only into approved execution path.                                                      |
| Storage Security Gate           | W3                      | Readiness verdict and evidence for production Secret Delivery and Secret Sync.                                                                           |
| Secret Version Store            | W4                      | Wrapped material and exact IDs only; append, publish, rollback, discard; no approval knowledge.                                                          |
| Operation Store                 | W1 with W8/W10          | Durable operation state, idempotency, wait/retry metadata, leases, fencing tokens, cancellation, and audit references.                                   |
| Protected Change Orchestrator   | W6                      | Metadata-only exact-ID state machine for Promotion, rollback, approval, and policy gates.                                                                |
| Provider Adapter Port           | W8                      | Metadata-only plan/lookup plus approved write execution; no provider value read-back.                                                                    |
| Runtime Injection Grant Service | W5 with W7              | Short-lived one-use grant issue/consume for exact Runtime Injection Policy Version.                                                                      |
| Audit Event Writer              | W10                     | Typed tenant-qualified event write with Sensitive Metadata handling and export compatibility.                                                            |
| Human Approval Surface          | W9 with W6              | Web-mediated challenge and approval UI for bounded operation IDs and impact reviews.                                                                     |

## Integration Order

1. W0 establishes the repo, package manager, lint/type/test gates, CI skeleton, and cache posture.
2. W1, W2, and W3 define interface stubs together, then build persistence, access, and crypto in
   parallel against fake adapters where needed.
3. W4 builds the Secret Version Store and safe write/read-for-use paths on top of W1 and W3.
4. W2, W4, W5, and W10 build the First Value Milestone only through the contract in
   [first-value-milestone.md](../first-value-milestone.md).
5. W5 builds CLI command framework and non-protected First Value Runtime Injection on W2/W4.
6. W6 and W9 build Protected Change Orchestration and the Human Approval Surface on W2/W4.
7. W7 adds Machine Identity, GitHub OIDC, and deploy credentials so protected runtime injection has
   a real credential boundary.
8. W8 adds App Connections and Cloudflare/GitHub sync on W1/W3/W4/W6/W10.
9. W10 keeps audit, telemetry, backup, restore, incident response, and release-gate evidence wired
   throughout.

## W0 - Tooling, CI, And Supply Chain

Owns:

- pnpm 10 upgrade and workspace install posture.
- ESLint flat config, type-aware rules, Prettier, and size/complexity budgets.
- Turbo tasks and cache policy, including remote read for developers/agents and remote write only
  for CI.
- GitHub Actions topology: validate, PR preview, staging deploy, production deploy, daily security
  scan.
- Secret scanning, dependency scanning, SBOM/vulnerability hooks, and fork isolation.

Does not own product schema, auth flows, or runtime behavior.

Primary references: [ADR-0053](../adr/0053-remote-build-cache-trust-model.md),
[ADR-0054](../adr/0054-tenant-isolation-tests-real-postgres.md),
[ADR-0055](../adr/0055-eslint-prettier-type-aware-toolchain.md),
[ADR-0056](../adr/0056-supply-chain-hardening-posture.md),
[build-tooling.md](../build-tooling.md).

Done means `pnpm validate` is the local and CI truth, the required workflows exist, remote cache
write is CI-only, forked PRs receive no secret-bearing jobs, and adding a dependency that wants a
postinstall fails until reviewed.

## W1 - Persistence, Tenant Boundary, And Operations State

Owns:

- Neon Postgres schema, migrations, runtime and migration roles, RLS policies, and role guardrails.
- Tenant-Scoped Store with transaction-local tenant scope and no raw executor escape.
- Core tenant tables for Instance, Organization, Project, Environment, Default Team, Membership
  references, Opaque Resource IDs, and Display Names.
- Durable operation state, idempotency keys, lease rows, compare-and-set primitives, and partial
  unique indexes for one-use or single-pending invariants.
- Real Postgres RLS test harness using the runtime `NOBYPASSRLS` role.

Does not own authorization semantics, encryption, provider adapters, or CLI UX.

Primary references: [ADR-0027](../adr/0027-shared-instance-topology-and-binding-map.md),
[ADR-0036](../adr/0036-neon-postgres-over-hyperdrive-with-rls.md),
[ADR-0037](../adr/0037-tenant-scoped-bound-store-over-rls.md),
[ADR-0054](../adr/0054-tenant-isolation-tests-real-postgres.md),
[ADR-0057](../adr/0057-inline-sync-execution-and-partial-failure-model.md),
[operation-store.md](../operation-store.md).

Interface commitments:

- `withTenantScope(scope, callback)` or equivalent is the only database entry point.
- RLS policies ship in the same migration as their tables.
- Store tests prove an unscoped query fails closed and cross-org reads are blocked by the database.
- Operation Store tests prove idempotent start, compare-and-set transitions, safe polling output,
  lease fencing, and no Sensitive Values in operation metadata.

## W2 - Human Identity, Authorization, And Onboarding

Owns:

- WorkOS AuthKit integration, session cookies, CSRF, session rotation, MFA enrollment state, and
  High-Assurance Challenge initiation.
- Instance Bootstrap, Bootstrap Secret validation, Bootstrap Operator Claim CAS, and initial owner
  Membership creation.
- Guided Organization Provisioning, Personal Organization creation, Default Team creation,
  Invitation acceptance, and Membership management.
- Effective Access Resolver, Role presets, Authorization Scope vocabulary, and request-scoped
  access memoization.
- Agent session step-up contract: exit code `10`, `auth.high_assurance_required`, bounded
  operation IDs.

Does not own web layout, protected approval state machine, machine credential exchange, or Service
Access UI.

Primary references: [ADR-0003](../adr/0003-human-authentication-and-authorization.md),
[ADR-0009](../adr/0009-workos-mfa-without-sms.md),
[ADR-0010](../adr/0010-workos-authkit-for-human-authentication.md),
[ADR-0020](../adr/0020-instance-and-deployment-posture.md),
[ADR-0032](../adr/0032-agent-session-execution-and-step-up.md),
[ADR-0034](../adr/0034-effective-access-resolver.md),
[ADR-0040](../adr/0040-guided-personal-organization-provisioning.md),
[first-value-milestone.md](../first-value-milestone.md).

Interface commitments:

- Routes receive resolved actor context and call the resolver; they never inspect Role names.
- Resolver tests prove org-tier plus project-tier union, no human bypass, no cross-org scope leak,
  and one batch read for many resource IDs.
- High-Assurance Challenge completion yields bounded single-action evidence, not reusable broad
  authority.
- Guided Organization Provisioning creates First Value objects through normal Organization,
  Membership, Project, Environment, and audit paths.

## W3 - Key Custody, Keyring, Encryption, And Storage Security Gate

Owns:

- Cloudflare Secrets Store integration for instance root key and instance-level secrets.
- Offline escrow metadata and operational hooks for root/audit signing key custody.
- Organization Data Keys, Project Data Keys, key versions, and the Keyring.
- Domain-agnostic encryption envelope and wrappers for Secrets, Provider Credentials, and Sensitive
  Metadata.
- Customer-Managed Key Custody mode and Custody-Locked state, if included in the implementation
  slice.
- Storage Security Gate readiness checks and evidence.

Does not own Secret Version lifecycle, protected approval, provider writes, or backup job
orchestration.

Primary references: [ADR-0005](../adr/0005-key-hierarchy-and-rotation.md),
[ADR-0026](../adr/0026-encryption-envelope-below-per-domain-wrappers.md),
[ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md),
[ADR-0031](../adr/0031-keyring-below-the-encryption-engine.md),
[ADR-0044](../adr/0044-no-reveal-custody-is-a-product-surface-guarantee.md),
[ADR-0050](../adr/0050-customer-managed-key-custody.md),
[storage-security-gate.md](../storage-security-gate.md).

Interface commitments:

- Callers never receive key material.
- Rewrap never decrypts Sensitive Values.
- Decrypt errors are opaque and fail closed.
- Identity binding is reconstructed from trusted IDs, not stored ciphertext metadata.
- Gate verdict is machine-readable and blocks production Secret Delivery and Secret Sync.

## W4 - Secret Lifecycle And Version Store

Owns:

- Secret Shape, Secret, Secret Version, Draft Version, Published Version, Current Version, and
  rollback data model.
- Safe Sensitive Input validation: UTF-8, 64 KiB cap, explicit empty values, no argv/query/file
  ingress for ordinary writes.
- Secret Version Store over wrapped material only.
- Non-protected write path that can create or update current values.
- Protected Blind Secret Write path that creates Draft Versions only.
- Rollback as ciphertext copy, Draft Version Discard, tombstones, and retention metadata.
- Development-only Secret Import preflight and dry-run.

Does not own encryption implementation, approval policy, CLI rendering, or provider delivery.

Primary references: [ADR-0016](../adr/0016-delivery-first-secret-egress.md),
[ADR-0017](../adr/0017-protected-environment-promotion-and-rollback.md),
[ADR-0025](../adr/0025-secret-version-store.md),
[ADR-0041](../adr/0041-first-value-before-production-delivery.md),
[first-value-milestone.md](../first-value-milestone.md).

Interface commitments:

- Store API accepts and returns wrapped material only.
- Protected delivery can load Published Versions only.
- Draft Versions are never delivered.
- Rollback path has no decrypt call.
- Import failures and plans never include values or raw file contents.
- Non-protected First Value writes still create normal Secret Shapes, Secrets, and Secret Versions
  through the Secret Version Store.

## W5 - CLI, Local Config, And Runtime Injection

Owns:

- CLI command framework, global flags, JSON envelope, exit codes, and stable error codes.
- `.insecur.json`, CLI Profiles, scoped Display Name Resolution, and Destructive Confirmation UX.
- Memory/session-only CLI auth shell behavior and agent-safe step-up polling.
- `insecur run` and direct `run --variable-key` First Value path.
- Runtime Injection Policy commands and immutable Runtime Injection Policy Versions.
- Injection Grant retrieval, one-use consume, child process execution, and no stdout/stderr capture.

Does not own WorkOS browser login implementation, machine credential exchange, or secret storage.

Primary references: [ADR-0007](../adr/0007-developer-first-cli-contract.md),
[ADR-0016](../adr/0016-delivery-first-secret-egress.md),
[ADR-0032](../adr/0032-agent-session-execution-and-step-up.md),
[ADR-0035](../adr/0035-display-name-resolution.md),
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md),
[first-value-milestone.md](../first-value-milestone.md),
[cli-and-sync.md](../cli-and-sync.md).

Interface commitments:

- Human and JSON output are metadata-only by default.
- First Value commands use ordinary `secrets set` and `run` paths, not onboarding-only commands.
- Non-interactive destructive commands require exact Opaque Resource IDs.
- Protected Environment injection refuses human session tokens and requires W7 machine credentials.
- Child process output is never captured by insecur.

## W6 - Protected Changes, Approval, And Delivery Risk Policy

Owns:

- Protected Change Orchestrator implementation.
- Promotion Change Set, Approval Request, Approval Impact Review, Approval Impact Fingerprint,
  Approval Impact Snapshot, terminal closure states, and rollback coordination.
- Single-approver V1 policy behavior and threshold-generalizable data model.
- Delivery Risk Policy Presets, Preview Automation Opt-In, and Risk-Broadening change gates.
- High-Assurance Challenge evidence binding for approval and policy changes.

Does not own web UI components, authentication provider integration, Secret Version Store internals,
or provider writes.

Primary references: [ADR-0017](../adr/0017-protected-environment-promotion-and-rollback.md),
[ADR-0033](../adr/0033-staged-change-set-and-publish.md),
[ADR-0042](../adr/0042-policy-gated-delivery-channels.md),
[ADR-0043](../adr/0043-delivery-risk-policy-presets.md),
[protected-change-orchestration.md](../protected-change-orchestration.md).

Interface commitments:

- Orchestrator interface is metadata-only and exact-ID based.
- Approval cannot create or change protected delivery configuration.
- Protected delivery configuration approval cannot promote Draft Versions.
- Recomputed impact can stale an approval screen before live effects.
- V1 does not implement Staged Change Set / batch Publish, but schema and interfaces should not
  block adding it later.

## W7 - Machine Access, OIDC, And Deploy Credentials

Owns:

- Machine Identity model and project-scoped Machine Identity Memberships.
- Auth methods for GitHub Actions OIDC and Environment Deploy Keys.
- Short-lived machine access token minting, Credential Scopes, trusted source constraints, reuse
  and denial audit events.
- Deploy Key Rotation Policy, expiration, reminders, disable, and non-expiring risk visibility.
- Protected Environment machine credential boundary for Runtime Injection.

Does not own provider App Connections, user Memberships, or approval authority.

Primary references: [ADR-0004](../adr/0004-machine-identities-and-ci-auth.md),
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md),
[ADR-0029](../adr/0029-environments-and-cd-trust-model.md).

Interface commitments:

- Effective access for a machine credential is the intersection of Machine Identity Memberships,
  token scope, and Credential Scopes.
- Machine credentials cannot approve, reject, satisfy High-Assurance Challenges, or mutate
  protected delivery configuration alone.
- Deploy keys cannot grant Secret Sync, arbitrary secret selection, secret reveal, broad writes,
  membership access, or cross-environment access.

## W8 - App Connections, Provider Adapters, And Secret Sync

Owns:

- App Connection model, Provider App Registration model, provider authorization callback state, and
  credential reauthorization.
- Cloudflare scoped-token connection method and direct Worker secret adapter.
- GitHub App installation method and GitHub Actions secrets adapter.
- Vercel port contract as deferred/add-back-ready, not V1 adapter implementation.
- Secret Sync model, exact Secret Sync Bindings, Explicit Provider Lookup, Provider Drift, and
  provider value size preflight.
- Inline Sync Execution, Sync Execution Revalidation, partial-failure model, resume, target lease
  rows, and fencing tokens.

Does not own core secret write lifecycle, protected approval UI, or audit export formatting.

Primary references: [ADR-0006](../adr/0006-app-connections-and-secret-syncs.md),
[ADR-0011](../adr/0011-provider-connection-method-matrix.md),
[ADR-0022](../adr/0022-per-instance-provider-app-registration.md),
[ADR-0024](../adr/0024-libsodium-wasm-for-github-sealed-box.md),
[ADR-0039](../adr/0039-cloudflare-worker-secrets-sync-target.md),
[ADR-0057](../adr/0057-inline-sync-execution-and-partial-failure-model.md),
[operation-store.md](../operation-store.md),
[cli-and-sync.md](../cli-and-sync.md).

Interface commitments:

- Provider adapters never read provider-side Sensitive Values.
- Syncs use exact bindings only, never patterns.
- Sync execution revalidates immediately before decrypt/write.
- Sync operation state lives in the Operation Store; provider adapters do not own private status,
  retry, lease, or polling tables.
- Cloudflare stages all bindings into one Worker deploy.
- GitHub per-binding partial failure parks as `incomplete` with same-operation resume.
- Superseded ADR-0012/0013/0023 mechanics are not implemented in V1.

## W9 - Web BFF, Tenant Console, And Human Approval Surface

Owns:

- TanStack Start tenant web console deployed on Cloudflare Workers.
- BFF session cookie handling, CSRF integration, and Service Binding calls to the API Worker.
- Short-lived scoped web-to-API token minting with no browser-held bearer token.
- V1 metadata browsing pages needed for approval context.
- Human Approval Surface for High-Assurance Challenges, Approval Requests, impact review, and
  policy-gated confirmations.
- Structural no-reveal web token boundary.

Does not own Effective Access semantics, protected state machine decisions, or CLI reveal paths.

Primary references: [ADR-0051](../adr/0051-web-console-architecture.md),
[ADR-0052](../adr/0052-web-no-reveal-boundary-and-management-parity.md),
[ADR-0042](../adr/0042-policy-gated-delivery-channels.md),
[phasing.md](../phasing.md).

Interface commitments:

- Browser never receives an API bearer token.
- Browser never receives stored Sensitive Values, including non-protected reveal.
- V1 web does not implement full management parity unless scope changes.
- Service Access is a separate surface and not a role-gated tenant-console mode.

## W10 - Audit, Telemetry, Backup, Restore, Runbooks, And Claims

Owns:

- Audit Event Writer contract, audit table/event shape, denied-action coverage, and audit metadata
  safety.
- Tamper-evident and Ed25519-signed audit export plus `audit verify`.
- Allowlisted telemetry emission, Cloudflare Logpush/R2 raw log posture, and external sink guard.
- Metadata-safe Webhook Subscriptions and Event Notifications.
- Minimal backup: Neon PITR assumptions, daily encrypted logical R2 export, recovery canary, and
  restore drill runbook.
- Incident response runbooks, especially tenant-reported compromise triage and custody-material
  escalation.
- Security release gates and evidence bundles.
- Claim governance checks for no-reveal custody, audit export language, US data-at-rest residency,
  and regulated-industry exclusion.

Does not own product feature implementation except the audit/backup/telemetry hooks required to
prove and operate those features.

Primary references: [ADR-0008](../adr/0008-security-gates-and-runbooks.md),
[ADR-0014](../adr/0014-tamper-evident-audit-exports.md),
[ADR-0030](../adr/0030-hybrid-allowlisted-telemetry.md),
[ADR-0044](../adr/0044-no-reveal-custody-is-a-product-surface-guarantee.md),
[ADR-0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md),
[ADR-0046](../adr/0046-us-residency-claim-scoped-to-data-at-rest.md),
[ADR-0047](../adr/0047-regulated-industry-exclusion-by-contract-and-attestation.md),
[ADR-0048](../adr/0048-breach-forensic-record-separate-from-audit-retention.md),
[ADR-0058](../adr/0058-minimal-backup-and-tested-restore.md),
[ADR-0059](../adr/0059-tenant-reported-secret-compromise-response.md),
[security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).

Interface commitments:

- Audit events are typed, tenant-qualified, and exclude Sensitive Values.
- Telemetry is allowlist-by-construction, not scrub-after-capture.
- Restore drill is a pre-production gate, not post-v1 polish.
- Legal and marketing claims are checked against governing ADRs before publishing.

## Hand-Off Checklist For Any Workstream

Before handing off:

- Update tests for the seam you own, including negative and cross-tenant cases where relevant.
- Add or update release-gate evidence requirements if your work affects production security.
- Update [product-spec.md](product-spec.md) if implementation clarifies the decided shape.
- Link any new ADR in the relevant spec section.
- Leave downstream consumers with typed interfaces, stable error codes, and no need to inspect your
  private tables or implementation details.
