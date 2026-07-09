# Repo Navigation

Use this guide when you need to get oriented quickly. It is a map for finding the right source of
truth, not a replacement for the product specs or package context files.

## First Five Minutes

1. Read `docs/features.md` for the one-stop map of delivered major functionality.
2. Read `docs/project-status.md` for current implementation state, known gaps, and the build order.
3. Read `docs/vision.md` only when you need the north star or product framing.
4. Read `docs/whitepaper/threat-model.md` when touching custody boundaries, sensitive-value flows,
   security claims, or external security copy.
5. Read `CONTEXT-MAP.md` to choose the relevant package, app, or spec context.
6. Read the local `CONTEXT.md` for any package or app you will touch.
7. Read the smallest matching repo-local skill in `skills/*/SKILL.md` before workflow work.

Do not start by reading all ADRs. Start from the specs and local context maps, then open only the
ADRs linked by the relevant section.

## Where Things Live

This table is a navigational pointer that routes you to a starting doc; the normative owner-map is
the content-ownership table in the Source Of Truth Rules of
[../specs/README.md](../specs/README.md). Where the two disagree, this table is the defect.

| Need                                             | Start here                                               |
| ------------------------------------------------ | -------------------------------------------------------- |
| Delivered major functionality                    | `docs/features.md`                                       |
| Current state, next steps, and not-yet-done list | `docs/project-status.md`                                 |
| Threat model, custody boundary, and claim limits | `docs/whitepaper/threat-model.md`                        |
| Product north star and non-goals                 | `docs/vision.md`                                         |
| Authoritative domain vocabulary                  | `docs/context/glossary/` slices, indexed by `CONTEXT.md` |
| Which context file to load                       | `CONTEXT-MAP.md`                                         |
| Package ownership and dependency direction       | `docs/context-map.md`                                    |
| Current product shape and ADR trace links        | `docs/specs/product-spec.md`                             |
| Architecture group boundaries                    | `docs/specs/architecture-groups.md`                      |
| Production MVP acceptance contract               | `docs/production-mvp-acceptance.md`                      |
| First Value build contract                       | `docs/first-value-milestone.md`                          |
| First Value Linear ticket graph                  | `docs/specs/first-value-ticket-plan.md`                  |
| CLI and provider sync behavior                   | `docs/cli-and-sync.md`                                   |
| Web console UX decisions                         | `docs/web-console-ux.md`                                 |
| Agent experience (AX) decisions                  | `docs/agent-experience.md`                               |
| Storage readiness gate                           | `docs/storage-security-gate.md`                          |
| Protected change flow                            | `docs/protected-change-orchestration.md`                 |
| Operation retry, resume, and leases              | `docs/operation-store.md`                                |
| Agent workflow values and Linear rules           | `docs/agents/workflow/config.md`                         |
| Cursor Cloud setup                               | `docs/agents/cursor-cloud-environment.md`                |

## Code Routing

Product behavior is composed through package seams and capability-isolated Worker deploys. The
authoritative route → deploy table is
[`docs/specs/deploy-route-inventory.md`](../specs/deploy-route-inventory.md) (generated from route
sources via `pnpm routes:inventory`; hand-edit `deploy-route-inventory.sidecar.json` for deploy
intros and route notes only). Do not restate the table here.

| Area                                                           | Files                               |
| -------------------------------------------------------------- | ----------------------------------- |
| Public API Worker: transport, routes, bindings, hop token      | `apps/api/`                         |
| Private Runtime Worker: keyring/decrypt-egress, RuntimeService | `apps/runtime/`                     |
| Web Console BFF (`insecur-web`)                                | `apps/web/`                         |
| Shared Worker composition glue (http/auth)                     | `packages/worker-kit/`              |
| CLI parsing, local config, output, and child process execution | `packages/cli/`                     |
| Shared branded primitives and result vocabulary                | `packages/domain/`                  |
| Machine Identity auth method exchange                          | `packages/machine-auth/`            |
| Authorization and Effective Access                             | `packages/access/`                  |
| Tenant-scoped transactions and RLS adapter contract            | `packages/tenant-store/`            |
| Plaintext-free custody and wrapped-material contracts          | `packages/custody-contracts/`       |
| Keyring, envelope encryption, and ciphertext binding           | `packages/crypto/`                  |
| Runtime-only tenant-backed Keyring composition                 | `packages/tenant-keyring/`          |
| Metadata-only audit events                                     | `packages/audit/`                   |
| Public-safe Secret Write validation and errors                 | `packages/secret-store-contracts/`  |
| Secret Shape, Blind Secret Write, and Secret Version Store     | `packages/secret-store/`            |
| Public-safe Runtime Injection grant issue path                 | `packages/runtime-injection-issue/` |
| Runtime Injection grants                                       | `packages/runtime-injection/`       |
| Guided Organization Provisioning                               | `packages/onboarding/`              |
| Instance Bootstrap and Bootstrap Operator Claim                | `packages/instance-bootstrap/`      |
| Operation Store and Sync Target Serialization                  | `packages/operations/`              |
| Security Evidence Bundle assembly                              | `packages/release-gate/`            |
| Copyable First Value proof                                     | `examples/first-value-proof/`       |

For package work, read the package `CONTEXT.md` first, then load only the glossary slice and
ADRs named by that local context.

## Linear And Workflow Routing

- Read `docs/agents/workflow/config.md` first for Linear conventions, labels, statuses, and
  workflow values; the workflow itself is the shared `ziw-*` skills.
- Use `skills/ziw-to-issues/SKILL.md` to turn specs, PRDs, or epics into Linear implementation work.
- Use `skills/ziw-triage/SKILL.md` to audit or repair tracker readiness.
- Use `skills/ziw-implement/SKILL.md` for one ready issue.
- Use `skills/ziw-code-review/SKILL.md` for bug-focused review of a diff, branch, or PR,
  including before opening a PR.
- Use `skills/ziw-pr/SKILL.md` to open or ship the current branch as a PR.
- Use `skills/ziw-review/SKILL.md` for the periodic sidecar review of newly landed `main`
  commits that should become queued fixes.

Agents should treat Linear as the queue and dependency graph, but repo docs as the product,
security, and domain source of truth.

## Search Habits

- Use `rg --files` to list files by area.
- Use `rg "<term>" docs/context/glossary docs packages apps` to find domain language or
  implementation references.
- Prefer local `CONTEXT.md` files and specs over broad searches through `docs/adr`.
- When a term appears ambiguous, check its `docs/context/glossary/` slice (and
  `docs/context/glossary/terminology-rules.md`) before inventing synonyms.
- When docs conflict, resolve it with the deterministic resolution in the Source Of Truth Rules of
  [../specs/README.md](../specs/README.md): the non-owning doc loses and you proceed on the owner;
  only owner-vs-owner conflicts stop and reopen the decision.

## Current Shape To Remember

The repo is documentation-led, but it is no longer planning-only. Build on the accepted executable
scaffold: the First Value app/package code, Node 24/pnpm 10 workspace baseline, Turbo task graph,
Prettier/ESLint/Vitest wiring, and `pnpm verify`.

The Worker topology is capability-isolated: `apps/api` (`insecur-api`) is the public edge with no
root-key binding; `apps/runtime` (`insecur-runtime`) is the sole `INSTANCE_ROOT_KEY_V1` holder with
no public `/v1/*` routes, reached only over the private `RUNTIME` Service Binding;
`apps/web` (BFF) is scaffolded (`insecur-web`, INS-201). See
[`docs/specs/deploy-route-inventory.md`](../specs/deploy-route-inventory.md) for the live route
mounts and [`docs/project-status.md`](../project-status.md) for a status snapshot — but treat that
snapshot as lower authority than owning specs/ADRs and verified code when they disagree (per the
Source Of Truth Rules in [`docs/specs/README.md`](../specs/README.md)).

The package graph is likewise split by capability: public/API-facing packages use
`@insecur/custody-contracts`, `@insecur/secret-store-contracts`, and
`@insecur/runtime-injection-issue` instead of importing `@insecur/crypto`. The package-boundary
conformance gate (`pnpm conformance:packages`, included in `pnpm verify`) fails any forbidden
production dependency path from public/contract packages into `@insecur/crypto`.
