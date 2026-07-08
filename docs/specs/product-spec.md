# Canonical Product Spec

Last updated: 2026-07-05.

This is the linear implementation-facing specification for the currently decided insecur product.
It consolidates accepted ADRs, scope decisions, and operational constraints so agents can build from
one place. ADR links are included for traceability and rationale.

## 1. Product Posture And Scope

insecur is a secrets manager for developers, agents, and CI working in the Cloudflare, GitHub
Actions, and eventually Vercel stack. It is not a single-owner local secret file helper. The durable
product model is tenant-first: Organizations own Projects, Environments, Memberships, Machine
Identities, App Connections, Secret Syncs, tenant-qualified audit, and tenant-bound keys.

The first product wedge is Diskless Development Secret Use in a non-protected development
Environment. The user reaches value through Guided Organization Provisioning, a Personal
Organization, a first Project, a development Environment, a service-generated Blind Secret Write,
and local Runtime Injection. This First Value path must use the real domain model, not an unsafe
alternate mode. The First Value Milestone contract is the thin vertical slice through the real
Tenant-Scoped Store, Effective Access Resolver, Keyring, encryption envelope, Secret Version Store,
Runtime Injection Grant Service, and Audit Event Writer seams.

Production Delivery follows with Protected Environments, provider Secret Sync, machine access,
OIDC, Human Approval Surface, audit/export, runbooks, and the Storage Security Gate. Valuable
production secrets must not be stored or delivered before the Production Delivery baseline and
Storage Security Gate pass.

The security boundary is deliberately not the same in dev and in production, and the two must
not be blurred: a local agent can read a development secret it uses, while Protected Environment
values have no local read path at all. The owning statement of that divide — including
**Local Mode** (account-less local development custody), hosted development, and production —
and what is and is not enforced in each tier, is
[whitepaper/threat-model.md §2.5](../whitepaper/threat-model.md#25-the-custody-boundary-local-dev-and-production);
this spec does not restate that tier table.

V1 means the reduced production spine decided on 2026-05-25, not "every accepted future-facing
ADR." V1 keeps:

- Tenant-first schema on Hyperdrive-backed Neon Postgres with Row-Level Security and the
  Tenant-Scoped Store.
- Envelope encryption with AES-256-GCM, organization/project data keys, `key_version`, and
  ciphertext identity binding.
- WorkOS AuthKit, MFA without SMS, High-Assurance Challenges, scope-first authorization, and the
  Effective Access Resolver.
- Protected Change Orchestration for single-approver production promotion, rollback, staleness
  transitions, and Delivery Risk Policy Presets.
- Machine identities and GitHub Actions OIDC for short-lived CI access.
- Cloudflare and GitHub provider sync, plus profile-based `insecur run` for local and deploy
  injection.
- BFF/session-cookie web security, with V1 web limited to metadata browsing, the Human Approval
  Surface, and the first-run onboarding wizard.
- Full CI, real Postgres RLS tests, security gates, and supply-chain hardening.

Deferred scope lives in [docs/phasing.md](../phasing.md#deferred-scope-parking-lot). While an item
remains in that parking lot, do not create Linear projects, project milestones, parent issues,
implementation issues, or placeholder tickets for it. Active work may preserve additive seams, but
must not build deferred behavior until the item is promoted in the repo docs.

Trace: [ADR-0001](../adr/0001-tenant-first-control-plane.md),
[ADR-0015](../adr/0015-production-v1-security-baseline.md),
[ADR-0018](../adr/0018-retire-unsafe-pre-v1-scaffold.md),
[ADR-0021](../adr/0021-small-group-production-first.md),
[ADR-0040](../adr/0040-guided-personal-organization-provisioning.md),
[ADR-0041](../adr/0041-first-value-before-production-delivery.md),
[first-value-milestone.md](../first-value-milestone.md),
[phasing.md](../phasing.md).

## 2. Deployment And Instance Topology

An Instance is the deployment boundary above Organization. Hosted Instances and Self-Hosted
Instances use the same runtime, codebase, Instance Configuration, Organization model, and provider
port contracts. Self-hosting means deploying into customer-controlled Cloudflare infrastructure, not
running a separate non-Cloudflare product.

V1 runs **multiple capability-isolated Cloudflare Worker deploys**, not one worker, plus
Hyperdrive-backed Neon Postgres as the source of truth. The deploys are:

- **API** (`apps/api`, script `insecur-api`): the public, caller-agnostic edge. It serves the
  public/human-facing routes and holds **no** keyring or root-key binding **and no Hyperdrive
  binding**. It performs **no DB I/O**: every DB-backed operation (admission resolution, onboarding
  and membership provisioning, operation polling, grant issue, bootstrap status/claim) is forwarded
  to the Runtime over the private Service Binding
  ([ADR-0077](../adr/0077-capability-isolated-worker-deploys.md)).
- **Runtime** (`apps/runtime`, script `insecur-runtime`): the only deploy that holds the instance
  root key (`INSTANCE_ROOT_KEY_V1`) and the only place ciphertext becomes plaintext. It serves **no
  public routes**; it is reachable only over a private Cloudflare Service Binding through a
  `WorkerEntrypoint` RPC seam with a short-TTL scoped token, and the Effective Access Resolver runs
  inside it so authorization and decryption are one indivisible call.
- **Web** (`apps/web`, script `insecur-web`): the Backend-for-Frontend; it owns the human session
  cookie, CSRF, and rotation, and calls the API over a private Service Binding
  ([ADR-0051](../adr/0051-web-console-architecture.md),
  [ADR-0052](../adr/0052-web-no-reveal-boundary-and-management-parity.md)).
- **Public Site** (`apps/site`, script `insecur-site`): the public marketing and legal site for
  `insecur.cloud` and `www.insecur.cloud`. It uses the same TanStack frontend stack as the Web BFF
  through a shared Tailwind + shadcn-based `@insecur/ui` component and style package. `@insecur/ui`
  is presentational and content-free: it owns design tokens, shared components, and branded layout
  primitives, not routes, marketing copy, legal text, loaders, auth/session logic, analytics,
  experiments, or product API types. The Public Site is not a BFF: it owns no auth session, has no
  database, keyring, API, Runtime, or product-control-plane binding, and its import boundary is
  enforced with dependency-cruiser: production source in `@insecur/site` may import only
  `@insecur/ui` and capability-free `@insecur/observability` from the workspace, and production
  source in `@insecur/ui` may import no `@insecur/*` packages
  ([ADR-0078](../adr/0078-public-site-worker.md)). The Web BFF remains the
  authenticated app surface, for example `app.insecur.cloud`. Public-site feature flags and A/B
  testing are future work; the mechanism is not decided. The initial public routes are the landing
  page, no-reveal mechanism page, legal terms, privacy policy, and an open-security posture page
  that frames the intended threat model and verification path at a high level, linking to public code
  and threat-model/security-design material once those are public. Pricing is deferred until the
  tester phase has real charging intent. The primary Public Site call to action is product use
  through the **First Value Proof**: a copyable, static terminal demo using the real CLI to
  initialize, save or generate a development secret, and use it through Runtime Injection in a small
  command or mock service. The initial site does not run browser-executed demos, hosted sandboxes, or
  browser-side secret workflows. Public GitHub links may appear once the repository is public. Legal
  terms and privacy copy live as Public Site content under
  `apps/site/content/legal/`, are not generated from product specs or ADRs, and require
  legal/publication review before going public. The Public Site deploys with the same shared Worker
  fleet workflows as the other app Workers, not through a separate production path. Preview deploys
  route `preview.insecur.cloud` to `insecur-site-preview`; the shared preview app surfaces route
  `api.preview.insecur.cloud` to `insecur-api-preview` and `app.preview.insecur.cloud` to
  `insecur-web-preview`. Production deploys route `insecur.cloud` and `www.insecur.cloud` to
  `insecur-site` as part of `Deploy Production`, alongside `insecur-runtime`, `insecur-api`, and
  `insecur-web`. Production deploy runs after successful `CI` on `main`, with manual dispatch
  retained as an operator fallback. The shared
  preview workflow owns CI migration before Worker deploy; First Value smoke remains an explicit
  post-deploy check.
- **Service Access**: a separate deploy with its own auth audience, deferred past V1
  ([ADR-0019](../adr/0019-service-access-without-secret-reveal.md)) but never collapsed into another
  deploy when built.

**Topology invariant (normative): no deploy may hold both a public route group and the root-key
binding. Exactly one deploy declares `INSTANCE_ROOT_KEY_V1`, and that deploy serves zero public
routes.** This is the deploy-level expression of the decrypt-egress boundary
([ADR-0071](../adr/0071-decrypt-egress-import-boundary.md)) and the minimize-secret-resident-surface
rule ([ADR-0064](../adr/0064-minimize-secret-resident-surface.md)): the surface that can decrypt
is structurally isolated, not gated by a code conditional. Secret Sync executes inline inside the
Runtime deploy ([ADR-0057](../adr/0057-inline-sync-execution-and-partial-failure-model.md)); there is
no separate sync worker. A monolith that mixes public routes with decrypt authority is forbidden.

R2 stores encrypted backups and forensic/archive artifacts. Cloudflare Secrets Store holds
instance key material and instance-level secrets. Workers KV is excluded for security-relevant
state because eventual consistency is unsafe for revocation and authorization. Cloudflare Queues
and Durable Objects are deferred past V1; their concerns are handled in Postgres by lease rows,
compare-and-set updates, and partial unique indexes. Every V1 time-based runtime data-lifecycle
edge is evaluated lazily at access or claim time; V1 ships no background sweeper, cron, or scheduled
runtime data-lifecycle job, and scheduled operational jobs such as the backup export are out of that
rule's scope ([ADR-0076](../adr/0076-lazy-lifecycle-expiry-and-retained-version-disposal.md)).

Durable operation state goes through the Operation Store. Operation records, idempotency keys,
wait/retry metadata, Sync Target Serialization leases, fencing tokens, and audit references are
tenant-qualified metadata in Postgres, not queue payloads or provider-adapter private tables.

Neon Postgres is reached through Cloudflare Hyperdrive. Only the Runtime deploy binds Hyperdrive and
talks to Postgres; the public edge (API, Web BFF) holds no Hyperdrive binding and forwards all
DB-backed work to the Runtime over the private Service Binding
([ADR-0077](../adr/0077-capability-isolated-worker-deploys.md)). The Postgres connection string lives
only in the Cloudflare Hyperdrive configuration, never as a Worker secret and never in Cloudflare
Secrets Store; the Runtime Worker holds only the Hyperdrive binding. The Hyperdrive configuration disables
query caching for the runtime path because revocation and authorization reads require Postgres
strong consistency; there is no security-relevant read cache in V1. The database runtime role is
`NOBYPASSRLS`; migrations use a distinct elevated role. Hyperdrive transaction-mode pooling means
tenant scope is transaction-local, not session-global, and the driver must not rely on prepared
statements.

Package seams share one failure contract: failures surface an `ErrorBody`-compatible shape with a
stable `KnownErrorCode` on `code` and a boolean `retryable`, so callers map any package failure to
one error envelope without learning package-private dialects. The decrypt opacity carve-out below
is the only exception to cause visibility.

Staging and production run as `wrangler` environments inside one Cloudflare account for now.
During prelaunch, production deploys auto-run after successful `CI` on `main` through the
protected `Production` GitHub Environment, and the executor is a CI-held machine identity. While
single-account deployment holds, staging must not contain real customer secrets, and Secrets Store
account roles must stay limited to the operator.

Trace: [ADR-0002](../adr/0002-cloudflare-native-focused-stack.md),
[ADR-0019](../adr/0019-service-access-without-secret-reveal.md),
[ADR-0020](../adr/0020-instance-and-deployment-posture.md),
[ADR-0027](../adr/0027-shared-instance-topology-and-binding-map.md),
[ADR-0029](../adr/0029-environments-and-cd-trust-model.md),
[ADR-0036](../adr/0036-neon-postgres-over-hyperdrive-with-rls.md),
[ADR-0037](../adr/0037-tenant-scoped-bound-store-over-rls.md),
[ADR-0049](../adr/0049-vendor-ports-and-adapters.md),
[ADR-0051](../adr/0051-web-console-architecture.md),
[ADR-0052](../adr/0052-web-no-reveal-boundary-and-management-parity.md),
[ADR-0057](../adr/0057-inline-sync-execution-and-partial-failure-model.md),
[ADR-0062](../adr/0062-package-seam-failures-are-errorbody-compatible.md),
[ADR-0064](../adr/0064-minimize-secret-resident-surface.md),
[ADR-0071](../adr/0071-decrypt-egress-import-boundary.md),
[ADR-0077](../adr/0077-capability-isolated-worker-deploys.md),
[operation-store.md](../operation-store.md).

## 3. Tenant Model And Onboarding

Organization is the tenant boundary. Project belongs to exactly one Organization. Every durable
selector is an Opaque Resource ID. Organization-scoped resource routes are organization-qualified
(`/v1/orgs/:org/...`) in production, with two recorded exceptions: onboarding and Guided
Organization Provisioning routes resolve the Organization from the authenticated session because
the Organization does not exist yet, and the shipped First Value by-variable-key secret-write and
runtime-injection grant routes are a recorded divergence that must be re-homed under
`/v1/orgs/:org` before the Production MVP acceptance gate. Membership and Effective Access
enforcement is identical either way. CLI commands either make Organization context explicit or
derive it from checked local project config.

V1 creates one non-authorizing Default Team per Organization. Invitation acceptance adds the User
to that Default Team, but access still requires an explicit Membership. A V1 Invitation targets
exactly one Membership grant: either one organization-scoped Role or one project-scoped Role.

Bounded Onboarding controls Organization creation. Instance Bootstrap creates the Instance,
Instance Configuration, first Organization, WorkOS-ready Instance Identity Configuration, and a
pending Bootstrap Operator Claim. The first Instance Operator is granted only after a Human Identity
Provider-authenticated User presents the Bootstrap Secret. The claim is consumed atomically, and
claim completion separately grants an owner Membership in the first Organization.

Hosted solo users may receive a Personal Organization through Guided Organization Provisioning
when the Instance admits the user and abuse controls are active. The flow creates a Default Team,
owner Membership, first Project, and non-protected development Environment with default names so
the user can reach First Value before provider setup. Guided provisioning is create-only: no
reconcile, no identity-based idempotency, and no deny-when-already-owns check. A User may own many
Organizations, and a reused client-minted resource ID fails with a clean
`onboarding.resource_conflict` rather than resolving to the existing resource.

Protected Environment is a property, not a name. Development is non-protected. Staging and
production are Protected. Preview defaults to Protected and can be opted down to non-protected only
when its values are confirmed non-production.

Trace: [ADR-0001](../adr/0001-tenant-first-control-plane.md),
[ADR-0020](../adr/0020-instance-and-deployment-posture.md),
[ADR-0021](../adr/0021-small-group-production-first.md),
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md),
[ADR-0040](../adr/0040-guided-personal-organization-provisioning.md),
[ADR-0063](../adr/0063-guided-provisioning-creates-does-not-reconcile.md),
[TODOS.md #5](../../TODOS.md).

## 4. Identity, Authorization, And Step-Up

WorkOS AuthKit owns human authentication, including hosted login, MFA, passkeys, and TOTP. SMS is
not a primary or recovery MFA factor. GitHub identity, if useful, must be routed through WorkOS
rather than maintained as a separate first-party OAuth stack.

Login establishes identity only. Authorization is scope-first. User and Team Memberships assign
Role presets; Roles contribute Authorization Scopes. V1 Built-In Roles are owner, admin, developer,
metadata viewer, approval, and read-only. Owner includes approval scopes for solo-owner operation.
Admin and developer do not. The Approval Role grants approval/rejection authority without project
configuration, App Connection, Secret Sync, Runtime Injection Policy, membership, or Service Access
authority. The Metadata Viewer Role grants scoped metadata detail visibility where Metadata
Visibility Policy allows it; it grants no Sensitive Value access, Secret Reveal, Secret Delivery,
Runtime Injection, Secret Sync, configuration mutation, or approval authority, does not bypass the
Sensitive Detail Gate for decrypted Sensitive Metadata, and is not assignable to Machine Identities
in V1.

The Authorization Scope atom vocabulary and the Built-In Role scope bundles are enumerated in code:
`packages/access/src/authorization-scopes.ts` and `packages/access/src/built-in-role-scopes.ts` are
the canonical source for atom names and preset bundles. Atoms follow ADR-0034's shape rule:
`resource:verb`, no wildcard form, with breadth structural rather than token-based. The relational
constraints in this spec and CONTEXT.md remain normative invariants those bundles must satisfy:
owner includes approval scopes, admin and developer do not, and the Approval Role carries no
configuration or membership scopes. These relational constraints are enforced by the registry
conformance suite in `packages/access`, and a violating bundle change fails `pnpm verify`
([ADR-0034](../adr/0034-effective-access-resolver.md)).

Every route and service asks the Effective Access Resolver for the actor's coordinate-bound
Authorization Scope set, then checks the one scope an action requires. Routes never branch on
actor type or Role name; where a denial is machine-only, the distinguishing scope is what the
service checks, not the actor type (Protected Environment Injection Grant issuance, section 7,
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md)). The resolver decides
only inside one Organization. Service Access is a
separate cross-organization gate with its own audit and no Secret Reveal or Secret Delivery scope.
The Service Access surface is deferred past V1, but the boundary must not be collapsed into tenant
authorization.

High-risk actions require a High-Assurance Challenge through the Human Approval Surface. Agents run
inside a human session and inherit the human's short-lived session token, but they cannot clear
High-Assurance Challenges. High-risk CLI/API attempts return exit code `10` and
`auth.high_assurance_required` with a bounded operation ID for the human to clear in the web app.
A human-session bounded operation is cleared only by the same session User whose Effective Access
the action was evaluated under, via fresh factor verification; a machine-credential bounded
operation is cleared only by a User whose own Effective Access includes the Authorization Scope
the pending action requires. Clearing authorizes only the exact bounded operation captured at
creation, imports none of the clearing User's wider access, never extends the original credential
past its hard bounds, and records the clearing User in audit alongside the original credential.
Approval Request approval and rejection authority is governed separately by the Protected Approval
Policy. There is no time-boxed elevation window in V1; every step-up, including each CLI-side
non-protected Secret Reveal, is a fresh per-action High-Assurance Challenge that grants no
reusable authority.

Machine Identities are Organization-owned actors that exchange auth methods for short-lived access
tokens. V1 Machine Identity Memberships are project-scoped only. GitHub Actions OIDC is preferred
for CI. Environment Deploy Keys are a fallback auth method for a Machine Identity and are bounded
to one Organization, Project, Environment, and explicit Runtime Policy Key IDs. Machine actors
cannot satisfy High-Assurance Challenges or approve customer Approval Requests.

Trace: [ADR-0003](../adr/0003-human-authentication-and-authorization.md),
[ADR-0004](../adr/0004-machine-identities-and-ci-auth.md),
[ADR-0009](../adr/0009-workos-mfa-without-sms.md),
[ADR-0010](../adr/0010-workos-authkit-for-human-authentication.md),
[ADR-0019](../adr/0019-service-access-without-secret-reveal.md),
[ADR-0032](../adr/0032-agent-session-execution-and-step-up.md),
[ADR-0034](../adr/0034-effective-access-resolver.md),
[ADR-0042](../adr/0042-policy-gated-delivery-channels.md),
[ADR-0051](../adr/0051-web-console-architecture.md).

## 5. Persistence, Crypto, And Storage Gate

All persistence goes through the Tenant-Scoped Store. No route, domain function, or caller receives
a raw SQL executor. The store opens a short transaction, sets the tenant scope transaction-locally,
runs the callback against a scoped handle, and commits. Tenant isolation has three layers:
application `org_id` filters, Postgres Row-Level Security with `FORCE ROW LEVEL SECURITY` under a
`NOBYPASSRLS` runtime role, and tenant-bound crypto.

The key hierarchy is layered:

- Instance root key material lives outside Postgres.
- Organization Data Keys protect organization-level encrypted data and Sensitive Metadata.
- Project Data Keys protect project secrets and project-scoped sensitive data where available.
- Organization and Project Data Keys are independent random keys generated at provisioning, stored
  AES-GCM wrapped under the instance root key inline in `wrapped_storage_ref`, with AAD binding the
  key's tenant identity and data-key version. The read path unwraps under the recorded root key
  version; derivation is forbidden in the production keyring.
- Root rotation rewraps wrapped key blobs only. Rotation and rewrap must not decrypt Sensitive
  Values, Provider Credentials, or Sensitive Metadata, and never rewrite record ciphertext. The
  rotation scheduler stays deferred past V1.
- Per-record or per-version Data Encryption Keys protect values inside the encryption envelope.
- Encrypted records store key version metadata needed to decrypt or rewrap.

The Keyring module sits below the encryption engine. It resolves root, organization, project, and
per-record key material, exposes a uniform rewrap primitive, and owns tenant-scoped in-memory cache
boundaries. The encryption engine is domain-agnostic and sits below thin wrappers for Secrets,
Provider Credentials, and Sensitive Metadata. It returns wrapped material only; callers never hold
keys, and decrypt output may enter only an approved execution path. Approved execution paths are the
modules on the decrypt-import allowlist decided by ADR-0071. The lint boundary and
`eslint.config.ts` restricted-import block enforce the allowlist; adding a path remains an
ADR-traced boundary change, not a code-only change
([ADR-0071](../adr/0071-decrypt-egress-import-boundary.md)). Decrypt failure
is a single opaque fail-closed error: every cause surfaces as wire code `crypto.decrypt_failed` with
`retryable` false and no cause discriminant.

Key material is request-scoped only: the instance root key, Organization and Project Data Keys,
per-record DEKs, and unlocked Sensitive Values are reachable in the Worker only for the span of
the single request that needs them, never as module-global state and never resident in
`process.env` in production. The production root key resolves on demand through the Cloudflare
Secrets Store binding only; `INSECUR_INSTANCE_ROOT_KEY_HEX` is a development-only convenience, and
production refuses it fail-closed with `RootKeyNotConfiguredError`. This is window-narrowing, not
in-process secrecy: during an active decrypt the keys and resulting plaintext are necessarily in
memory.

Ciphertext identity binding is reconstructed from trusted Opaque Resource IDs at decrypt time, not
stored beside ciphertext. The ciphertext layer binds immutable identity and no Secret content
version, so rollback can copy ciphertext across versions of the same Secret without decrypting. The
DEK-wrap layer binds the data-key coordinate and format marker.

The default Hosted Instance root key lives in Cloudflare Secrets Store with sealed offline escrow
recorded before loading. This is not zero-knowledge. Deploy/account-privileged access can bind and
read the root key at runtime in V1, so customer-facing language must say no-reveal custody and no
product read path, not "we cannot decrypt." External KMS is the migration trigger when a Hosted
Instance has multiple Service Access operators.

Customer-Managed Key Custody is a decided future Organization-scoped Hosted Instance mode, deferred
past V1 in the [phasing.md deferred-scope parking lot](../phasing.md#deferred-scope-parking-lot).
V1 is single instance root with no Bring Your Own Key; ADR-0064's per-request, on-demand
key-resolution seam is what keeps the mode additive. The customer supplies a wrapping authority and
can revoke the grant outside insecur. Enabling or replacing the mode rewraps both Organization Data
Keys and Project Data Keys onto the customer custody authority, so after revocation the instance
root can unwrap no key in the Organization's scope. While active, insecur runtime can decrypt only
through the customer-granted path for approved operations; after revocation, decrypting operations
fail closed and the Organization becomes Custody-Locked.

A schema column not on the Plaintext Metadata Allowlist registry is presumed Sensitive Metadata and
must be stored through the Sensitive Metadata envelope; the conformance gate fails closed on any
unregistered column, so registering a column under a plaintext category is the explicit act that
allows plaintext. See [ADR-0070](../adr/0070-plaintext-metadata-allowlist-registry-and-conformance-gate.md).

Production Secret Delivery and Secret Sync must fail closed until the Storage Security Gate
verifies root key placement, tenant data keys, key versions, Tenant-Scoped Store/RLS readiness,
encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and
no-plaintext persistence.

Trace: [ADR-0005](../adr/0005-key-hierarchy-and-rotation.md) (incl. 2026-06-03 wrapped-data-keys
amendment), [ADR-0026](../adr/0026-encryption-envelope-below-per-domain-wrappers.md),
[ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md) (incl. 2026-06-03 rewrap
amendment), [ADR-0031](../adr/0031-keyring-below-the-encryption-engine.md),
[ADR-0036](../adr/0036-neon-postgres-over-hyperdrive-with-rls.md),
[ADR-0037](../adr/0037-tenant-scoped-bound-store-over-rls.md),
[ADR-0044](../adr/0044-no-reveal-custody-is-a-product-surface-guarantee.md),
[ADR-0049](../adr/0049-vendor-ports-and-adapters.md),
[ADR-0050](../adr/0050-customer-managed-key-custody.md),
[ADR-0062](../adr/0062-package-seam-failures-are-errorbody-compatible.md),
[ADR-0064](../adr/0064-minimize-secret-resident-surface.md),
[storage-security-gate.md](../storage-security-gate.md).

## 6. Secret Lifecycle And No-Reveal Egress

insecur is the Secret Source of Truth. Provider secret stores and child process environments are
derived delivery destinations.

The product distinguishes Secret Use, Secret Delivery, and Secret Reveal. Protected Environment
secrets never support Secret Reveal, including for owners and Service Access. Secret Reveal in a
non-protected Environment is a CLI-side egress that requires a per-reveal bounded-operation
High-Assurance Challenge cleared on the Human Approval Surface; clearing grants no reusable
authority, and there is no time-boxed reveal elevation window in V1. The CLI reveal command itself
is deferred past V1. Break-glass may allow additional delivery, rotation, replacement, provider
reauthorization, or rollback, but not plaintext disclosure. Sensitive Values must not appear in
default API output, CLI output, UI, JSON, logs, audit metadata, operation payloads, queue payloads,
telemetry, or agent-facing output; only the modules on the decrypt-import allowlist may produce
decrypt plaintext at all. The lint boundary that enforces this lives in `eslint.config.ts`
(section 5, [ADR-0071](../adr/0071-decrypt-egress-import-boundary.md)).

Sensitive Values enter only through safe input paths: request bodies over TLS, CLI stdin, masked
TTY prompts, service generation, provider authorization flows, or development-only Secret Import.
V1 managed Secret values are UTF-8 text only, measured in encoded bytes, capped at 64 KiB before
write. Invalid UTF-8, oversized values, implicit binary/base64 decoding, and replacement-character
decoding are rejected. Zero-length values require an explicit empty-value control. Sensitive Values
must never be accepted in URLs, route params, query strings, CLI arguments, named local value files
for ordinary writes, or GET requests.

Secret Import is a non-protected development migration helper. It is create-only, all-or-nothing,
preflights the whole file, writes nothing on conflicts or parse failures, has no delivery side
effects, does not rewrite or delete the source file, and never supports steady-state pull/export to
plaintext `.env`, dotenv, JSON, or equivalent secret files. Protected, preview, staging,
production, and other non-development Environments reject import.

The Secret Version Store sits below promotion and approval. It stores wrapped material only and is
regime-ignorant. Non-protected writes can append and make live immediately. Protected writes create
Draft Versions in the Draft Area. Promotion atomically makes exact Draft Version IDs live as
Published Versions. Rollback is a no-decrypt ciphertext copy from a retained prior Published
Version into a new live version. Rollback eligibility is controlled by a configurable Rollback
Retention Window, evaluated lazily at rollback request time; the default is still an open product
limit. A Retained Published Version outside the window is rollback-ineligible, but its wrapped
ciphertext is retained, not crypto-erased, in V1; crypto-erasure-on-expiry is parked in
[phasing.md](../phasing.md#deferred-scope-parking-lot)
([ADR-0076](../adr/0076-lazy-lifecycle-expiry-and-retained-version-disposal.md)).

Shared Secret Sources are explicit named attachments. Environments do not inherit secret values
from other Environments. Non-protected Environments may copy Secret Shapes from Protected
Environments, never protected values.

Trace: [ADR-0007](../adr/0007-developer-first-cli-contract.md),
[ADR-0016](../adr/0016-delivery-first-secret-egress.md),
[ADR-0017](../adr/0017-protected-environment-promotion-and-rollback.md),
[ADR-0025](../adr/0025-secret-version-store.md),
[ADR-0026](../adr/0026-encryption-envelope-below-per-domain-wrappers.md),
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md),
[ADR-0041](../adr/0041-first-value-before-production-delivery.md).

## 7. Runtime Injection And CLI Contract

The CLI is the primary interface for developers, agents, and CI. A committed non-secret
`.insecur.json` stores host, Organization ID, Project ID, Environment ID, profile ID, branch to
Environment defaults, and other opaque selectors. `insecur login` persists the short-lived session
credential sealed under the machine root key held by the OS-keychain-backed `KeyStore` seam
(ADR-0080), never plaintext at rest; `--no-persist` keeps the credential memory-only. Credential
resolution order is process memory, then `INSECUR_SESSION_TOKEN`, then the persisted record, and a
persisted record is used only for its stored host. `insecur logout` removes the persisted record.
Authenticated shells and one-shot commands keep short-lived tokens in process memory or the child
process environment for that shell session (ADR-0007, 2026-07-06 amendment).

CLI commands must be scriptable: stable `--json`, stable error codes, predictable exit codes,
`--dry-run` for mutations, idempotency keys for high-risk writes, operation IDs for work that must
be resumed or waited on, and metadata-only output by default.

Display Names may be used for ergonomic targeting only after client-side exact scoped resolution to
one Opaque Resource ID. The server contract remains opaque-ID-only. Destructive non-interactive and
Machine Identity actions require Opaque Resource IDs and do not accept Display Names. Interactive
humans may resolve by name only with a Destructive Confirmation that echoes the resolved Opaque
Resource ID.

Runtime Injection Policies are the saved workflow boundary for repeatable commands. A policy
contains exact secret bindings, command constraints, TTL, optional Command Fingerprint requirement,
and delivery behavior. Policies never support wildcard, prefix, suffix, regex, tag, folder, or
pattern-based secret selection. Runtime Injection Policy Versions are immutable and retained as
non-plaintext audit metadata.

Every Runtime Injection run receives a fresh short-lived, one-use Injection Grant. Grant
consumption is compare-and-set. The CLI wrapper can be the V1 injector: fetch grant, hold Sensitive
Values only in memory, fork/exec the approved child with environment variables, and avoid stdout,
JSON, logs, shell history, or disk. insecur must not capture or store stdout/stderr from injected
child processes.

An Injection Grant moves `issued -> consumed | expired | revoked`, with the three non-issued states
terminal. Secret bindings and the delivered secret version ID pin at issue and are never re-resolved
at consume; clock expiry is evaluated lazily inside the consume compare-and-set. V1 revocation verbs
are exactly two: Tenant Suspension and compromise-response version invalidation; ordinary policy
edits do not revoke in-flight grants, and revocation survives tenant reinstatement. See
[ADR-0074](../adr/0074-injection-grant-lifecycle-and-revocation.md).

Protected Environment Runtime Injection requires a Machine Identity credential bound to the
Environment. A human session token, including one inherited by a local agent, cannot obtain a
Protected Environment Injection Grant. This is the boundary that keeps local agents away from
production-grade plaintext. Protected Environment Injection Grant issuance requires
`runtime_injection:grant_issue_protected`, which no Built-In Role bundle contains and which only
machine credential resolution can contribute; the grant service maps the Environment's protection
property to the required scope and does not inspect actor type. See
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md).

Trace: [ADR-0007](../adr/0007-developer-first-cli-contract.md),
[ADR-0016](../adr/0016-delivery-first-secret-egress.md),
[ADR-0032](../adr/0032-agent-session-execution-and-step-up.md),
[ADR-0035](../adr/0035-display-name-resolution.md),
[ADR-0038](../adr/0038-protected-delivery-requires-machine-credential.md),
[ADR-0042](../adr/0042-policy-gated-delivery-channels.md),
[cli-and-sync.md](../cli-and-sync.md).

## 8. Protected Changes, Approval, And Delivery Policy

Protected Environment secret changes require Promotion before they affect Secret Sync or Runtime
Injection. Setting a secret in a Protected Environment is a Blind Secret Write that creates a Draft
Version without returning the Sensitive Value. A Promotion request creates an immutable Promotion
Change Set over exact Draft Version IDs in one Protected Environment and an Approval Request.

The Protected Change Orchestrator owns the state machine for Promotion, rollback, approval,
staleness, cancellation, supersession, draft-discard closure, and final apply. It consumes Effective
Access, High-Assurance Challenge evidence, Sensitive Detail Gate decisions, Storage Security Gate
status, and delivery adapter revalidation. Its interface is metadata-only and exact-ID based.

V1 uses a one-approver Protected Approval Policy so a solo owner can operate. Requester
self-approval is allowed only when the requester has approval scopes and completes a
High-Assurance Challenge. The data model should remain threshold-generalizable, but multi-approver
and Partial Approval workflows are deferred past V1.

Approval Impact Review is recomputed before approval or final apply. It includes enabled affected
Secret Syncs, Provider Value Size Limit eligibility, and Cloudflare Worker Secret Deploy impact
where applicable. The accepted Approval Impact Snapshot is the historical metadata-only evidence
for the delivery and sync impact the final approver acted on. Promotion approval authorizes
Immediate Sync After Promotion for already-enabled affected Secret Syncs, run inline in the
triggering request, only when that impact appeared in the accepted Approval Impact Review. The
Cloudflare Worker Secret Deploy needs no second approval, while creating, enabling, or changing a
sync stays a separate protected delivery configuration action.

Delivery Risk Policy uses simple presets backed by versioned policy infrastructure. Balanced is the
default for newly provisioned Organizations and Projects. Strict requires human review or
confirmation for preview delivery and all protected production gates. Balanced allows
non-protected development automation and preview automation only after explicit per-Environment
Preview Automation Opt-In. Automation-Friendly allows non-protected development automation and
preview automation by default for non-protected preview Environments in scope. No preset can make
Protected Environment production approval terminal-only or agent-clearable in V1.

Staged Change Set and batch Publish are accepted as the future model for batching protected value
and configuration changes, but they are deferred past V1. V1 implementers should keep data and
interfaces add-back-ready without building the full batch workflow.

Trace: [ADR-0017](../adr/0017-protected-environment-promotion-and-rollback.md),
[ADR-0033](../adr/0033-staged-change-set-and-publish.md),
[ADR-0042](../adr/0042-policy-gated-delivery-channels.md),
[ADR-0043](../adr/0043-delivery-risk-policy-presets.md),
[protected-change-orchestration.md](../protected-change-orchestration.md),
[phasing.md](../phasing.md).

## 9. App Connections And Secret Sync

App Connections are Organization-owned and store encrypted provider credentials. Secret Syncs are
Project-owned and map exact insecur Secrets to provider destinations. Secret Syncs never own
provider credentials. Provider OAuth and app-install callbacks are cross-tenant account-linking
boundaries with one-time tenant-bound state, current access re-checks, returned provider identity
verification, and fail-closed behavior on replay, mismatch, cancellation, tenant suspension, or
lost access.

Provider App Registration is Instance-owned for app-install and OAuth methods. Each Instance
registers its own GitHub App and Vercel Integration. Self-Hosted Instances use the same code path
with customer-owned registrations. Scoped-token methods such as Cloudflare scoped API token have no
Provider App Registration.

V1 provider implementation order is Cloudflare plus GitHub. Vercel Integration OAuth and adapter
contracts remain decided, but the Vercel sync adapter is deferred past V1.

GitHub Actions sync uses GitHub App installation tokens. Protected GitHub syncs target existing
GitHub Environment secrets inside the selected repository by default. insecur must not auto-create
GitHub Environments, and protected sync blocks when the target GitHub Environment has no visible
protection rules. Repository-wide GitHub Actions secrets are allowed only when the workflow truly
needs repository-wide availability or does not use GitHub Environments.

Cloudflare sync targets direct per-Worker secrets on explicit Worker scripts. The App Connection
uses scoped Cloudflare API tokens until a suitable install-style app flow exists. Cloudflare Worker
secret writes have provider-side deploy impact and must be labeled as production deploys in plan,
approval, and audit output. The Cloudflare adapter stages all bindings into one new Worker version
and deploys once, so it does not land in per-binding partial state.

Secret Sync is exact-binding only. It never supports all-secrets, tag, prefix, suffix, regex,
folder, or pattern-based selection. It is one-way from insecur to the provider. Verification checks
provider metadata, status, timestamps, key presence, and protection state only; it must never read
provider-side Sensitive Values. Removing a binding deletes the provider-side managed copy.
Disabling a sync leaves provider-side managed copies in place with warnings. Deleting a sync is
destructive, attempts cleanup, and tombstones the sync for audit even if provider cleanup leaves
Orphaned Managed Provider Copy warnings.

Explicit Provider Lookup is metadata-only and bounded to exact configured local intent. It checks
one exact destination inside one App Connection and Connection Boundary to produce overwrite or
availability status. It must not list provider inventory, enumerate unrelated names, expose raw
provider responses, expose provider-native error text, or read Sensitive Values. Provider target
names, existence status, and binding names are Sensitive Metadata.

Sync execution is inline in the triggering request. Each run creates an Operation record, returns
an operation ID, performs Sync Execution Revalidation immediately before decrypt or provider write,
and records per-binding status. Deterministic pre-write failure blocks all provider writes and ends
`blocked`. After writes begin, a provider failure produces an `incomplete` Operation with retryable
or action-required cause. Resume reuses the same operation ID, reclaims the lease, revalidates, and
writes only pending or failed bindings. The Operation Store owns this durable state, idempotency,
polling, retry, cancellation, lease, and fencing-token metadata; provider adapters own only provider
plan/lookup/write behavior behind their Adapter Port.

Sync Target Serialization uses a lease row in the Tenant-Scoped Store keyed by Organization,
provider, and target identity, with expiry and a fencing token. There is no dead-letter queue,
background sweeper, Durable Object, or Postgres advisory lock in V1.

Trace: [ADR-0006](../adr/0006-app-connections-and-secret-syncs.md),
[ADR-0011](../adr/0011-provider-connection-method-matrix.md),
[ADR-0012](../adr/0012-queue-backed-sync-execution.md) (superseded by 0057),
[ADR-0013](../adr/0013-durable-object-sync-target-serialization.md) (superseded by 0057),
[ADR-0022](../adr/0022-per-instance-provider-app-registration.md),
[ADR-0023](../adr/0023-cloudflare-secrets-store-sync-target.md) (superseded by 0039),
[ADR-0024](../adr/0024-libsodium-wasm-for-github-sealed-box.md),
[ADR-0039](../adr/0039-cloudflare-worker-secrets-sync-target.md),
[ADR-0057](../adr/0057-inline-sync-execution-and-partial-failure-model.md),
[operation-store.md](../operation-store.md),
[cli-and-sync.md](../cli-and-sync.md).

## 10. Web, API, And Human Surfaces

The product surface is CLI plus a tenant web console. Service Access is a separate surface and is
deferred past V1.

The tenant console is server-rendered with TanStack Start on Cloudflare Workers. The browser talks
only to the web Worker. The web Worker is a BFF that owns HttpOnly SameSite session cookies, CSRF
protection, and session rotation, then calls the API Worker through a private Cloudflare Service
Binding with a short-lived scoped token. No API bearer token is placed in browser-reachable
storage. The API Worker authorizes web, CLI, agents, and CI through the same Effective Access
Resolver.

The browser is never a Secret Reveal surface. The long-term web target has management parity with
the CLI except reveal; it can accept Sensitive Values through masked write-only input, but never
returns or renders stored Sensitive Values. V1 web scope is narrower: metadata browsing, the Human
Approval Surface, and the first-run onboarding wizard (Guided Organization Provisioning with an
optional first Blind Secret Write and CLI handoff, per
[web-console-ux.md](../web-console-ux.md)). Full web management parity beyond that wizard is
deferred past V1.

The Human Approval Surface handles Protected Environment approval, High-Assurance Challenges,
Risk-Broadening Delivery Changes, protected delivery configuration approval, and Cloudflare Worker
Secret Deploy approval evidence. Agent-reachable CLI/API channels can plan, request, stage, poll,
and retry, but cannot clear protected production gates.

Approval Notifications are alert-only and metadata-safe. Push payloads and emails contain no
Approval Context Note plaintext, Sensitive Values, decrypted Sensitive Metadata, Display Names,
approval impact details, or action links that approve/reject. Deep links route only to the
authenticated approval view.

Trace: [ADR-0032](../adr/0032-agent-session-execution-and-step-up.md),
[ADR-0042](../adr/0042-policy-gated-delivery-channels.md),
[ADR-0051](../adr/0051-web-console-architecture.md),
[ADR-0052](../adr/0052-web-no-reveal-boundary-and-management-parity.md),
[phasing.md](../phasing.md).

## 11. Audit, Telemetry, Notifications, And Forensics

Audit entries are tenant-qualified, typed, and metadata-only. They cover successful and denied
security-relevant actions, including auth/session transitions, Membership and scope changes, key
and credential operations, Secret writes, Promotion, rollback, Runtime Injection, Secret Sync,
provider drift, Storage Security Gate transitions, and runbook actions.

Audit event codes live only in `packages/audit/src/audit-event-codes.ts`, the canonical registry;
the grammar is `domain.action` with snake_case segments, and the writer rejects unregistered codes.
Every security-relevant action family has denied coverage, where denied codes end in `_denied` or
are domain-level denial codes; the pairing is per action family, not a mechanical suffix pair. See
[ADR-0068](../adr/0068-stable-dotted-code-vocabularies-in-canonical-catalogs.md).

Audit exports are tenant-bounded JSONL with a canonical per-export hash chain, HMACed manifest,
and Ed25519 signature in V1. Exports are tiered: low-privilege exports carry immutable IDs and
hashes and exclude Sensitive Metadata; full-fidelity exports may include decrypted Sensitive
Metadata only for authorized security review after the Sensitive Detail Gate. The private signing
key is an instance secret managed like the root key: generated offline, escrowed, stored in
Cloudflare Secrets Store, versioned, and rotated. The public key and historical versions are
published so exports remain independently verifiable after rotation. The honest claim is
"tamper-evident and independently verifiable," not tamper-proof, immutable, or non-repudiable
against insecur.

Operational telemetry is separate from audit. Raw logs stay Cloudflare-native, with Logpush to the
operator's R2. A separate allowlist-emit metadata-only stream may go to an external sink such as
Axiom. Telemetry never carries free-form interpolated messages, request/response bodies, provider
bodies, exception objects with locals, or Sensitive Values. Auto-capture must stay disabled.

Event Notifications and Webhook Subscriptions are metadata-safe. Payloads exclude Sensitive Values
and Sensitive Metadata and are HMAC-signed with per-subscription signing secrets.

The breach forensic record is separate from product audit retention. A durable R2 forensic archive
keeps tenant-qualified audit plus signed export linkage on a fixed retention floor independent of
product tier. Breach response correlates product audit, Cloudflare account and Secrets Store logs,
and out-of-band escrow access logs. Product audit alone cannot prove or disprove root-key
extraction.

Trace: [ADR-0014](../adr/0014-tamper-evident-audit-exports.md),
[ADR-0024](../adr/0024-libsodium-wasm-for-github-sealed-box.md),
[ADR-0030](../adr/0030-hybrid-allowlisted-telemetry.md),
[ADR-0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md),
[ADR-0048](../adr/0048-breach-forensic-record-separate-from-audit-retention.md),
[security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).

## 12. Backup, Restore, Incident Response, And Claims

V1 backup and restore covers three loss scenarios:

- Neon corruption, bad migration, or accidental delete with the Neon account intact: recover with
  Neon point-in-time restore, with 7-day history retention.
- Loss of Neon account or project: recover from one daily independent encrypted logical export in
  R2, encrypted under the existing instance custody chain. The export pipeline (Worker cron venue,
  per-organization scoped reads, JSONL envelope) and the continuously evaluated
  `backup_restore.export_fresh` freshness control are decided in
  [ADR-0072](../adr/0072-backup-export-pipeline-and-freshness.md).
- Root-key custody loss: recover from ADR-0028 offline sealed escrow.

Before any valuable production secret is stored, one end-to-end restore drill must pass: provision
a fresh Neon project, import the latest R2 export, load the escrowed root key into a fresh
Cloudflare Secrets Store binding, and decrypt a recovery canary to the expected value. The measured
restore time is recorded in the runbook. These are internal best-effort targets, not customer SLAs.

Tenant-reported secret compromise uses one triage-and-route runbook. Routine reports default to
tenant-side rotation: publish a new value, re-sync delivery targets, invalidate non-expired
Injection Grants for the old version, and enumerate reach from audit metadata. The tenant must
still revoke the leaked credential at its upstream issuer; insecur cannot do that unless it owns
that issuer. Escalation to custody-material compromise and forensic collection is signal-driven.
V1 stores no hash index or second representation of Secret values for leak detection; the
stored-hash design is rejected as the eventual design too, and Leak Verification, if built,
computes on demand and never persists a hash index (ADR-0059).

External claims are bounded:

- No "zero-knowledge," "we cannot decrypt," or "technically incapable of access." Use no-reveal
  custody, no product read path, and strong encryption with no casual access.
- US residency is scoped to durable data at rest, not global edge compute. Confirm Cloudflare
  Secrets Store, WorkOS, and Axiom region posture before publishing residency language.
- Regulated industries are excluded by AUP clickwrap, onboarding attestation, and no regulated
  marketing. No secret-content scanning is built to enforce this.

Trace: [ADR-0044](../adr/0044-no-reveal-custody-is-a-product-surface-guarantee.md),
[ADR-0046](../adr/0046-us-residency-claim-scoped-to-data-at-rest.md),
[ADR-0047](../adr/0047-regulated-industry-exclusion-by-contract-and-attestation.md),
[ADR-0048](../adr/0048-breach-forensic-record-separate-from-audit-retention.md),
[ADR-0058](../adr/0058-minimal-backup-and-tested-restore.md),
[ADR-0059](../adr/0059-tenant-reported-secret-compromise-response.md),
[open-questions.md](../open-questions.md).

## 13. Build, Test, Release, And Supply Chain

Security runbooks and release gates are product requirements. Before Small-Group Production, the
project needs threat model review, cross-tenant authorization tests, auth/session review, key
rotation and restore drills, app connection revocation tests, audit export tests, CLI
non-interactive flow tests, dependency scanning, secret scanning, and evidence bundles.

Automated tests are three layers: unit tests with no database, integration plus RLS tests against
real Postgres, and a preview-environment smoke. Cross-tenant and RLS regression suites run against
real Postgres as the `NOBYPASSRLS` runtime role via `DATABASE_URL_RUNTIME`, on Docker Compose
Postgres 17 locally and in CI's DB-backed `Verify` step. The no-plaintext canary gate
`pnpm test:canary` runs there as a fourth named command inside the integration layer (not a new
layer) and sweeps every column of every user table plus in-process console output for sentinel
Sensitive Values; see [ADR-0069](../adr/0069-no-plaintext-canary-gate.md). They never run against SQLite, PGlite,
mocks, or the elevated migration role. CI asserts runtime and migration credentials are distinct.
PRs never allocate Neon branches, Hyperdrive configs, or per-PR Workers. The Docker Compose
integration/RLS gate carries no secrets and is fork-safe by design, so it runs on all PRs. The
separate shared preview environment uses a shared Neon preview branch and Hyperdrive binding to run
the First Value loop over HTTP, but that environment is bounded and not created per PR. Postgres 17
is the development and CI database baseline until Postgres 18 is no longer preview on Neon. CI runs
on Blacksmith runners as a compute-only substitution: workflow logic, trust boundaries, and fork
isolation are unchanged.

Tooling is ESLint with type-aware `typescript-eslint` and Prettier for formatting. Complexity and
size budgets are required gates because agents are expected to write much of the code. A justified
inline disable is allowed; relaxing the global budget is not.

Supply-chain hardening uses pnpm 10 with blocked lifecycle scripts, an explicit
`onlyBuiltDependencies` allowlist, `strictDepBuilds`, and a 3-day `minimumReleaseAge`.
GitHub-native Dependabot must honor the same release-age floor via `.github/dependabot.yml`
(no hosted Renovate on the private repo). This makes pnpm 10 a prerequisite, not optional polish.

Turborepo remote cache is read-only for developers and agents and writable only by CI. Remote cache
artifacts are signed. A developer laptop or local agent must not be able to poison shared build
artifacts.

Trace: [ADR-0008](../adr/0008-security-gates-and-runbooks.md),
[ADR-0029](../adr/0029-environments-and-cd-trust-model.md),
[ADR-0053](../adr/0053-remote-build-cache-trust-model.md),
[ADR-0054](../adr/0054-tenant-isolation-tests-real-postgres.md),
[ADR-0055](../adr/0055-eslint-prettier-type-aware-toolchain.md),
[ADR-0056](../adr/0056-supply-chain-hardening-posture.md),
[ADR-0060](../adr/0060-postgres-17-development-baseline.md),
[ADR-0061](../adr/0061-blacksmith-github-actions-runners.md),
[ADR-0065](../adr/0065-test-layers-and-preview-smoke.md),
[build-tooling.md](../build-tooling.md),
[security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).

## 14. ADR Coverage Map

| Spec area                                              | ADRs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product posture and milestones                         | [0001](../adr/0001-tenant-first-control-plane.md), [0015](../adr/0015-production-v1-security-baseline.md), [0018](../adr/0018-retire-unsafe-pre-v1-scaffold.md), [0021](../adr/0021-small-group-production-first.md), [0040](../adr/0040-guided-personal-organization-provisioning.md), [0041](../adr/0041-first-value-before-production-delivery.md), [0063](../adr/0063-guided-provisioning-creates-does-not-reconcile.md)                                                                                                                                          |
| Topology, deployment, and vendor ports                 | [0002](../adr/0002-cloudflare-native-focused-stack.md), [0020](../adr/0020-instance-and-deployment-posture.md), [0022](../adr/0022-per-instance-provider-app-registration.md), [0027](../adr/0027-shared-instance-topology-and-binding-map.md), [0029](../adr/0029-environments-and-cd-trust-model.md), [0036](../adr/0036-neon-postgres-over-hyperdrive-with-rls.md), [0049](../adr/0049-vendor-ports-and-adapters.md), [0062](../adr/0062-package-seam-failures-are-errorbody-compatible.md)                                                                        |
| Human and machine access                               | [0003](../adr/0003-human-authentication-and-authorization.md), [0004](../adr/0004-machine-identities-and-ci-auth.md), [0009](../adr/0009-workos-mfa-without-sms.md), [0010](../adr/0010-workos-authkit-for-human-authentication.md), [0019](../adr/0019-service-access-without-secret-reveal.md), [0032](../adr/0032-agent-session-execution-and-step-up.md), [0034](../adr/0034-effective-access-resolver.md), [0038](../adr/0038-protected-delivery-requires-machine-credential.md)                                                                                 |
| Crypto, storage, and custody                           | [0005](../adr/0005-key-hierarchy-and-rotation.md), [0025](../adr/0025-secret-version-store.md), [0026](../adr/0026-encryption-envelope-below-per-domain-wrappers.md), [0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md), [0031](../adr/0031-keyring-below-the-encryption-engine.md), [0037](../adr/0037-tenant-scoped-bound-store-over-rls.md), [0044](../adr/0044-no-reveal-custody-is-a-product-surface-guarantee.md), [0050](../adr/0050-customer-managed-key-custody.md), [0064](../adr/0064-minimize-secret-resident-surface.md)              |
| CLI, runtime injection, and secret egress              | [0007](../adr/0007-developer-first-cli-contract.md), [0016](../adr/0016-delivery-first-secret-egress.md), [0035](../adr/0035-display-name-resolution.md), [0038](../adr/0038-protected-delivery-requires-machine-credential.md), [0052](../adr/0052-web-no-reveal-boundary-and-management-parity.md)                                                                                                                                                                                                                                                                  |
| Protected changes and policy                           | [0017](../adr/0017-protected-environment-promotion-and-rollback.md), [0033](../adr/0033-staged-change-set-and-publish.md), [0042](../adr/0042-policy-gated-delivery-channels.md), [0043](../adr/0043-delivery-risk-policy-presets.md)                                                                                                                                                                                                                                                                                                                                 |
| Provider sync                                          | [0006](../adr/0006-app-connections-and-secret-syncs.md), [0011](../adr/0011-provider-connection-method-matrix.md), [0012](../adr/0012-queue-backed-sync-execution.md) (superseded by 0057), [0013](../adr/0013-durable-object-sync-target-serialization.md) (superseded by 0057), [0023](../adr/0023-cloudflare-secrets-store-sync-target.md) (superseded by 0039), [0024](../adr/0024-libsodium-wasm-for-github-sealed-box.md), [0039](../adr/0039-cloudflare-worker-secrets-sync-target.md), [0057](../adr/0057-inline-sync-execution-and-partial-failure-model.md) |
| Web and approval surfaces                              | [0051](../adr/0051-web-console-architecture.md), [0052](../adr/0052-web-no-reveal-boundary-and-management-parity.md), [0078](../adr/0078-public-site-worker.md)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Audit, telemetry, backup, legal, and incident response | [0014](../adr/0014-tamper-evident-audit-exports.md), [0030](../adr/0030-hybrid-allowlisted-telemetry.md), [0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md), [0046](../adr/0046-us-residency-claim-scoped-to-data-at-rest.md), [0047](../adr/0047-regulated-industry-exclusion-by-contract-and-attestation.md), [0048](../adr/0048-breach-forensic-record-separate-from-audit-retention.md), [0058](../adr/0058-minimal-backup-and-tested-restore.md), [0059](../adr/0059-tenant-reported-secret-compromise-response.md)                              |
| Build, tests, and supply chain                         | [0008](../adr/0008-security-gates-and-runbooks.md), [0053](../adr/0053-remote-build-cache-trust-model.md), [0054](../adr/0054-tenant-isolation-tests-real-postgres.md), [0055](../adr/0055-eslint-prettier-type-aware-toolchain.md), [0056](../adr/0056-supply-chain-hardening-posture.md), [0060](../adr/0060-postgres-17-development-baseline.md), [0061](../adr/0061-blacksmith-github-actions-runners.md), [0065](../adr/0065-test-layers-and-preview-smoke.md)                                                                                                   |
