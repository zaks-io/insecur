# First Value Agent Ticket Plan

This is the implementation-ticket source of truth for the First Value Milestone. Linear is the
queue and dependency graph; this document is the repo-side copy of the intended project structure,
issue readiness rules, public interfaces, and acceptance scenarios.

The scope is provider-free Diskless Development Secret Use in one non-protected development
Environment. The slice must use Guided Organization Provisioning, Blind Secret Write, Runtime
Injection, Tenant-Scoped Store, Effective Access Resolver, Keyring and Encryption Envelope, Secret
Version Store, and Audit Event Writer. Provider sync, Protected Environments, Machine Identity,
production delivery, and approval UX are out of scope for this ticket graph.

## Linear Projects

Use two Linear projects under team `INS`:

| Project | Purpose |
| --- | --- |
| `First Value Customer Validation` | Discovery, design-partner onboarding, evidence review, and scope-gate work. |
| `First Value Implementation` | Agent-build work for the First Value Milestone. |

Do not create workstream labels. Use parent issues for workstreams and Linear relationships for
execution order.

## Workstream Parents

Create these parent issues in `First Value Implementation`. They are workstream containers, not
agent-ready implementation issues.

| Parent issue | Scope |
| --- | --- |
| `W0 - Tooling, CI, and Supply Chain` | Package manager, validation, CI, scanning, supply-chain posture. |
| `W1 - Persistence, Tenant Boundary, and Operations State` | Neon Postgres, RLS, Tenant-Scoped Store, Operation Store-adjacent primitives. |
| `W2 - Human Identity, Authorization, and Onboarding` | WorkOS, Memberships, Effective Access, Guided Organization Provisioning. |
| `W3 - Key Custody, Keyring, Encryption, and Storage Security Gate` | Key hierarchy, envelope encryption, custody readiness seams. |
| `W4 - Secret Lifecycle and Version Store` | Secret Shape, Secret Version Store, non-protected write path. |
| `W5 - CLI, Local Config, and Runtime Injection` | CLI framework, local config, one-use Runtime Injection grants. |
| `W10 - Audit, Evidence, and Release Gates` | Audit writer, telemetry, release-gate support. |

Parent issues start in `Backlog` and must not carry `ready-for-agent`.

## Readiness Rules

- Only unblocked issues in `Todo` may carry `ready-for-agent`.
- Blocked implementation issues stay in `Backlog` without `ready-for-agent`.
- HITL setup issues carry `ready-for-human`, not `ready-for-agent`.
- When a blocked AFK issue's blockers reach `Done`, move it to `Todo` and add `ready-for-agent`.
- Dependencies must be represented with Linear `blocked by` / `blocks` relationships, not labels.

## Ticket Graph

| Symbol | Parent | Type | Initial readiness | Blocked by | Outcome |
| --- | --- | --- | --- | --- | --- |
| `FV-01` | W0 | AFK | `ready-for-agent` | None | Node 24, pnpm 10, catalog, Turbo, ESLint, Prettier, Vitest, and `pnpm verify` baseline. |
| `FV-02` | W0 | AFK | blocked | `FV-01` | GitHub Actions validate workflow, fork isolation, secret/dependency scanning skeleton, CI cache posture. |
| `FV-H1` | W1 | HITL | `ready-for-human` | `FV-01` | Provision Neon/Hyperdrive dev and CI database inputs, migration/runtime roles, and `NOBYPASSRLS` test credentials. |
| `FV-H2` | W2 | HITL | `ready-for-human` | `FV-01` | Configure WorkOS AuthKit dev/staging app, redirects, and required non-secret instance identity settings. |
| `FV-H3` | W3 | HITL | `ready-for-human` | `FV-01` | Configure Cloudflare Secrets Store root-key secret names and offline escrow evidence; no secret values in Linear. |
| `FV-03` | W0 | AFK | blocked | `FV-01` | Shared branded IDs, Variable Key validation, metadata-only envelopes, stable errors, package interface stubs. |
| `FV-04` | W1 | AFK | blocked | `FV-02`, `FV-03`, `FV-H1` | Tenant-first schema, migrations, RLS policies, Tenant-Scoped Store, real Postgres RLS tests. |
| `FV-05` | W10 | AFK | blocked | `FV-03`, `FV-04` | Audit Event Writer with tenant-qualified metadata-only events and denied-attempt coverage. |
| `FV-06` | W2 | AFK | blocked | `FV-03`, `FV-04`, `FV-05` | Effective Access Resolver with built-in Role scopes, Membership expansion, and no Role-name route branching. |
| `FV-07` | W2 | AFK | blocked | `FV-04`, `FV-H2` | WorkOS-backed Worker session composition, actor context, CSRF/session rotation, CLI token exchange contract. |
| `FV-08` | W2 | AFK | blocked | `FV-04`, `FV-05`, `FV-06`, `FV-07` | Guided Organization Provisioning for Personal Organization, Default Team, owner Membership, first Project, development Environment. |
| `FV-09` | W3 | AFK | blocked | `FV-03`, `FV-04`, `FV-H3` | Minimal Keyring and Encryption Envelope with org/project data keys, key versions, AES-GCM identity binding. |
| `FV-10` | W4 | AFK | blocked | `FV-04`, `FV-05`, `FV-06`, `FV-09` | Secret Shape, Secret, Secret Version Store, and non-protected Blind Secret Write create-or-update. |
| `FV-11` | W5 | AFK | blocked | `FV-04`, `FV-05`, `FV-06`, `FV-10` | Runtime Injection Grant Service with one-use issue/consume for exact Variable Key selection. |
| `FV-12` | W5 | AFK | blocked | `FV-08`, `FV-10`, `FV-11` | Worker First Value routes compose onboarding, secret write, and runtime injection through package seams only. |
| `FV-13` | W5 | AFK | blocked | `FV-07`, `FV-08`, `FV-12` | CLI `login`, `shell`, `init`, global flags, JSON envelope, and `.insecur.json` with Opaque Resource IDs only. |
| `FV-14` | W5 | AFK | blocked | `FV-10`, `FV-12`, `FV-13` | CLI `secrets set --variable-key` with service generation, stdin, explicit empty value, metadata-only output. |
| `FV-15` | W5 | AFK | blocked | `FV-11`, `FV-12`, `FV-13` | CLI `run --variable-key -- <command>` consumes one grant, injects exact env var, never captures child output. |
| `INS-1` | W5 | AFK | blocked | `FV-02`, `FV-13`, `FV-14`, `FV-15` | Copyable First Value Proof passes end to end through ordinary commands and example verifier. |
| `INS-4` | W10 | AFK | blocked | `INS-1`, `FV-05` | Product-safe First Value telemetry and feedback capture for validation evidence. |

## Public Interfaces

The tickets add these public surfaces:

- CLI: `insecur login`, `insecur shell <profile-slug-or-id>`, `insecur init`,
  `insecur secrets set --variable-key`, and `insecur run --variable-key -- <command>`.
- Worker routes:
  - `POST /v1/onboarding/personal-organization`
  - `POST /v1/projects/:projectId/environments/:environmentId/secrets/by-variable-key`
  - `POST /v1/runtime-injection/grants`
  - `POST /v1/runtime-injection/grants/:grantId/consume`
- Package exports:
  - `withTenantScope(scope, callback)`
  - `resolveEffectiveAccess(actor, coordinate)`
  - `writeAuditEvent(event)`
  - `provisionGuidedOrganization(input)`
  - `encryptSecretValue(identity, value)` and `decryptSecretValueForRuntime(identity, wrapped)`
  - `writeNonProtectedSecret(input)`
  - `issueInjectionGrant(input)` and `consumeInjectionGrant(input)`

The grant-consume route is the only transport path allowed to carry decrypted Sensitive Values, and
only for immediate Runtime Injection. It must be non-loggable and never surfaced in human or JSON
CLI output.

## Test Scenarios

- Provisioning creates a Personal Organization, Default Team, owner Membership, first Project, and
  non-protected development Environment.
- Cross-tenant guessed Opaque Resource IDs fail at Effective Access and RLS.
- Secret writes reject invalid UTF-8, oversized values, invalid Variable Keys, implicit empty
  values, and argv/query/file-value ingress.
- Stored Secret Versions contain wrapped material only with key version and ciphertext identity
  binding.
- Runtime Injection consumes one fresh grant, injects only the requested Variable Key, and does not
  capture stdout/stderr.
- CLI config, JSON output, logs, audit metadata, telemetry, fixtures, screenshots, and Linear issue
  text contain no Sensitive Values.
- `examples/first-value-proof/verify.mjs` succeeds only through
  `insecur secrets set --generate` plus `insecur run`.

## Existing Issue Cleanup

- Keep `First Value Customer Validation` for validation work.
- Move `INS-1` to `First Value Implementation`, parent it under W5, retitle it to
  `Complete the copyable First Value Proof end to end`, and use it as the final proof ticket.
- Move `INS-4` to `First Value Implementation`, parent it under W10, and keep it as
  telemetry/feedback capture.
- Remove `INS-1 blocks INS-3`; recruiting can start before implementation completes.
- Set validation dependencies:
  - `INS-5` blocked by `INS-3` and `INS-1`.
  - `INS-6` blocked by `INS-5` and `INS-4`.
  - `INS-7` blocked by `INS-6`.
  - `INS-8` blocked by `INS-1`.
