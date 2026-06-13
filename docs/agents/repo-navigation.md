# Repo Navigation

Use this guide when you need to get oriented quickly. It is a map for finding the right source of
truth, not a replacement for the product specs or package context files.

## First Five Minutes

1. Read `docs/project-status.md` for current implementation state, known gaps, and the build order.
2. Read `docs/vision.md` only when you need the north star or product framing.
3. Read `CONTEXT-MAP.md` to choose the relevant package, app, or spec context.
4. Read the local `CONTEXT.md` for any package or app you will touch.
5. Read the smallest matching repo-local skill in `skills/*/SKILL.md` before workflow work.

Do not start by reading all ADRs. Start from the specs and local context maps, then open only the
ADRs linked by the relevant section.

## Where Things Live

This table is a navigational pointer that routes you to a starting doc; the normative owner-map is
the content-ownership table in the Source Of Truth Rules of
[../specs/README.md](../specs/README.md). Where the two disagree, this table is the defect.

| Need                                             | Start here                                |
| ------------------------------------------------ | ----------------------------------------- |
| Current state, next steps, and not-yet-done list | `docs/project-status.md`                  |
| Product north star and non-goals                 | `docs/vision.md`                          |
| Authoritative domain vocabulary                  | `CONTEXT.md`                              |
| Which context file to load                       | `CONTEXT-MAP.md`                          |
| Package ownership and dependency direction       | `docs/context-map.md`                     |
| Current product shape and ADR trace links        | `docs/specs/product-spec.md`              |
| Implementation workstream boundaries             | `docs/specs/agent-workstreams.md`         |
| Production MVP acceptance contract               | `docs/production-mvp-acceptance.md`       |
| First Value build contract                       | `docs/first-value-milestone.md`           |
| First Value Linear ticket graph                  | `docs/specs/first-value-ticket-plan.md`   |
| CLI and provider sync behavior                   | `docs/cli-and-sync.md`                    |
| Storage readiness gate                           | `docs/storage-security-gate.md`           |
| Protected change flow                            | `docs/protected-change-orchestration.md`  |
| Operation retry, resume, and leases              | `docs/operation-store.md`                 |
| Agent workflow and Linear rules                  | `docs/agents/workflow.md`                 |
| Cursor Cloud setup                               | `docs/agents/cursor-cloud-environment.md` |

## Code Routing

The current source tree is intentionally thin. Product behavior should be added through package
seams instead of route or CLI shortcuts.

| Area                                                           | Files                         |
| -------------------------------------------------------------- | ----------------------------- |
| Public API Worker: transport, routes, bindings, hop token      | `apps/api/`                   |
| Private Runtime Worker: keyring/decrypt-egress, RuntimeService | `apps/runtime/`               |
| Shared Worker composition glue (http/auth)                     | `packages/worker-kit/`        |
| CLI parsing, local config, output, and child process execution | `packages/cli/`               |
| Shared branded primitives and result vocabulary                | `packages/domain/`            |
| Authorization and Effective Access                             | `packages/access/`            |
| Tenant-scoped transactions and RLS adapter contract            | `packages/tenant-store/`      |
| Keyring, envelope encryption, and ciphertext binding           | `packages/crypto/`            |
| Metadata-only audit events                                     | `packages/audit/`             |
| Secret Shape, Blind Secret Write, and Secret Version Store     | `packages/secret-store/`      |
| Runtime Injection grants                                       | `packages/runtime-injection/` |
| Guided Organization Provisioning                               | `packages/onboarding/`        |
| Copyable First Value proof                                     | `examples/first-value-proof/` |

For package work, read the package `CONTEXT.md` first, then load only the root glossary terms and
ADRs named by that local context.

## Linear And Workflow Routing

- Use `docs/agents/issue-tracker.md` to understand Linear conventions.
- Use `docs/agents/autonomous-loop.md` before claiming or updating implementation work.
- Use `docs/agents/skill-usage.md` to choose a workflow skill.
- Use `skills/workflow-issue-triage/SKILL.md` to convert docs/specs into Linear work or audit it.
- Use `skills/workflow-agent-implement/SKILL.md` for one ready issue.
- Use `skills/workflow-code-review/SKILL.md` for bug-focused review of a diff, branch, or PR,
  including before opening a PR.
- Use `skills/workflow-create-pr/SKILL.md` to open or ship the current branch as a PR.
- Use `skills/workflow-agent-review/SKILL.md` for the periodic sidecar review of newly landed `main`
  commits that should become queued fixes.

Agents should treat Linear as the queue and dependency graph, but repo docs as the product,
security, and domain source of truth.

## Search Habits

- Use `rg --files` to list files by area.
- Use `rg "<term>" CONTEXT.md docs packages apps` to find domain language or implementation
  references.
- Prefer local `CONTEXT.md` files and specs over broad searches through `docs/adr`.
- When a term appears ambiguous, check root `CONTEXT.md` before inventing synonyms.
- When docs conflict, resolve it with the deterministic resolution in the Source Of Truth Rules of
  [../specs/README.md](../specs/README.md): the non-owning doc loses and you proceed on the owner;
  only owner-vs-owner conflicts stop and reopen the decision.

## Current Shape To Remember

The repo is documentation-led, but it is no longer planning-only. Build on the accepted executable
scaffold: the First Value app/package stubs, Node 24/pnpm 10 workspace baseline, Turbo task graph,
Prettier/ESLint/Vitest wiring, and `pnpm verify`.

Product behavior is still pre-implementation. The Worker exposes only a health-check route, package
entrypoints are empty, and the removed unsafe scaffold is not a compatibility target. New code
should implement the target product described by the specs and the First Value package seams.
