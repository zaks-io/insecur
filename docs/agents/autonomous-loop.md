# Autonomous Agent Loop

How autonomous implementation agents should use Linear and this repo.

Linear is the work scheduler. The repo is the source of truth for product, domain, security, and
implementation rules. Agents may execute clearly bounded work; they may not reshape product scope,
security posture, or domain language while doing so.

## Operating Model

- Keep implementation issues in the `INS` Linear team. Do not create an agent-only subteam for
  product work.
- Use Linear projects for product milestones such as First Value Milestone, Production Delivery
  Foundation, V1 Machine Access, V1 Sync, V1 Runtime Injection, and V1 Approval UX.
- Use project milestones or parent issues for workstreams from `docs/specs/agent-workstreams.md`.
  Do not create workstream labels.
- Use Linear relationships for dependency order. `blocked by` and `blocks` are the ordering
  mechanism; labels are routing metadata.
- Use `ready-for-agent` only for issues that an agent can implement without new product judgment.
- Use `ready-for-human` for issues that require product, security, credential, vendor, or
  architecture judgment before implementation.

An agent is an executor. A human remains responsible for deciding what should be built and whether
the result is acceptable.

## Ready For Agent Means

An issue may receive `ready-for-agent` only when all of these are true:

- It has one concrete implementation outcome.
- It names the relevant context docs and local package/app context files.
- It has explicit scope and out-of-scope sections.
- It has acceptance criteria that can be verified locally or in CI.
- It names required tests or explains why tests are not applicable.
- It lists security invariants relevant to the slice.
- Its blocking issues are done, or the remaining dependency is mocked behind an agreed interface.
- It does not require new ADR decisions, credential setup, provider approval, or customer judgment.

If any of these are missing, apply `needs-info` or `ready-for-human`, not `ready-for-agent`.

## Agent Selection Loop

Agents should only select work matching this shape:

- Team: `INS`
- Label: `ready-for-agent`
- Status: `Todo`
- Blocked: false
- Project: the active milestone project
- Assignee/delegate: empty, or explicitly delegated to that agent

Agents must not take issues labeled `ready-for-human`, `needs-info`, or `wontfix`.

## Claiming Work

When an agent starts an issue:

1. Move the issue to `In Progress`.
2. Assign or delegate the issue to the agent if Linear supports that agent.
3. Add a short Linear comment:

```md
Claiming this issue.

Plan:
- Read the listed context docs.
- Implement only the stated scope.
- Run the required checks.
- Open a PR linked to this issue.
```

4. Create a branch named from the issue ID and short title, for example:

```text
ins-123-tenant-store-rls-baseline
```

## Work Rules

Agents must:

- Read `AGENTS.md`, `CONTEXT-MAP.md`, the issue description, and the local context docs before
  editing.
- Use the terms in root `CONTEXT.md` exactly.
- Keep each PR scoped to one Linear issue.
- Prefer existing repo patterns and package ownership boundaries.
- Add or update tests proportional to the risk and blast radius.
- Update docs only when the issue requires it or the implementation changes the documented
  contract.
- Create follow-up Linear issues for discovered work instead of expanding the current scope.

Agents must not:

- Store, print, log, fixture, screenshot, or summarize Sensitive Values.
- Add reveal paths, plaintext exports, local secret files, or unsafe development shortcuts.
- Bypass the Tenant-Scoped Store, Effective Access Resolver, Keyring, Secret Version Store,
  Runtime Injection Grant Service, or Audit Event Writer where the spec requires those seams.
- Make route authorization decisions by actor type, Role name, owner shortcut, or guessed
  hierarchy.
- Introduce new product language without updating the glossary through the appropriate doc flow.
- Touch unrelated files for cleanup or refactoring.
- Merge their own PRs unless a human explicitly grants that authority for the repository.

## Blockers

When blocked, agents should stop and make the blocker visible. Do not improvise around missing
product decisions or security contracts.

Use this Linear comment:

```md
Blocked.

Reason:
- ...

Needed to continue:
- ...

Recommended next issue or decision:
- ...
```

Then move the issue to `Blocked` if that status exists, or apply `needs-info` or
`ready-for-human` as appropriate.

## Pull Request Handoff

PR titles should begin with the Linear issue ID:

```text
INS-123: Add tenant-scoped transaction wrapper
```

PR descriptions should include:

```md
## Summary

## Linear

Closes INS-123

## Changes

## Tests

## Security Notes

## Follow-up Issues
```

After opening the PR, add this Linear completion comment:

```md
Implementation ready for review.

PR:
- ...

Checks run:
- ...

Acceptance criteria satisfied:
- ...

Security invariants checked:
- ...

Follow-up issues:
- ...

Residual risk:
- ...
```

Move the issue to `In Review`. Move it to `Ready to Merge` only after review feedback is addressed
and required checks pass.

## Linear Field Contract

Agents treat Linear as the queue, state machine, and dependency graph. Linear views and templates
are optional human conveniences; agents must rely on the issue fields and issue body they can read
through the Linear MCP.

Interpret Linear fields this way:

| Linear field | Agent meaning |
| --- | --- |
| Team `INS` | The issue belongs to this repo. |
| Project | Product milestone or delivery slice. |
| Parent issue or project milestone | Workstream or architectural area from `docs/specs/agent-workstreams.md`. |
| Sub-issue | One implementation job, sized for one PR. |
| `blocked by` / `blocks` | Execution order. Do not start blocked work. |
| `ready-for-agent` | Permission for autonomous implementation. |
| `ready-for-human` | Human judgment required before implementation. |
| `needs-info` | Issue is missing enough context to execute. |
| Risk label | Review posture and extra care needed. |
| Type label | General work kind; not an execution rule. |
| Status | Current workflow state. |

Do not use labels for workstreams. Use parent issues, project milestones, and issue relationships
for that structure.

## Issue Body Contract

An agent-ready issue should contain enough prose for an agent to execute without guessing. It does
not need to follow an exact template, but it must answer these questions:

| Question | Required content |
| --- | --- |
| What is the outcome? | One concrete goal. |
| Where is the relevant context? | Links to repo docs, package `CONTEXT.md` files, specs, or ADRs. |
| What is in scope? | The behavior, files, modules, or tests the agent may touch. |
| What is out of scope? | Product decisions, cleanup, refactors, or adjacent work the agent must not absorb. |
| How is done verified? | Acceptance criteria and required local/CI checks. |
| What must remain true? | Security and domain invariants for the slice. |
| What depends on what? | Any blockers or downstream issues not already encoded in Linear relationships. |

If the issue body does not answer these questions, the agent must not implement. It should comment
with the missing information and move the issue to `Blocked`, `needs-info`, or `ready-for-human`
depending on what is missing.

## Status Contract

Agents should interpret statuses this way:

| Status | Agent behavior |
| --- | --- |
| `Backlog` | Planned work that is not ready to start. Do not claim. |
| `Todo` | Ready to start if it also has `ready-for-agent` and no blockers. |
| `In Progress` | Someone is actively working. Do not claim unless assigned/delegated. |
| `Blocked` | Cannot continue until the blocker is resolved. |
| `In Review` | Implementation is ready for review. |
| `Ready to Merge` | Review is complete and required checks are passing. |
| `Done` | Completed. Do not modify unless a follow-up issue says to. |
| `Canceled` | Intentionally closed without completion. Do not modify. |

## Label Contract

Readiness labels control whether an agent may work:

| Label | Agent behavior |
| --- | --- |
| `needs-triage` | Do not implement. Human sorting is needed. |
| `needs-info` | Do not implement. Required context is missing. |
| `ready-for-agent` | May implement if status is `Todo` and the issue is not blocked. |
| `ready-for-human` | Do not implement. Human judgment is required. |
| `wontfix` | Do not implement. |

Risk labels change review expectations:

| Label | Agent behavior |
| --- | --- |
| `risk-normal` | Normal implementation care. |
| `risk-security-sensitive` | Extra scrutiny for auth, custody, secrets, audit, or authorization. |
| `risk-schema` | Extra scrutiny for migrations, RLS, persistent schema, or data contracts. |
| `risk-cross-cutting` | Extra scrutiny for shared seams, multi-package behavior, or workflow changes. |

Use Linear's existing `Type` labels only as broad classification:

| Type label | Meaning |
| --- | --- |
| `Bug` | Defect fix. |
| `Feature` | New product or platform behavior. |
| `Improvement` | Existing behavior improvement. |
| `Tech Debt` | Refactor, cleanup, or maintenance. |
| `Spike` | Research, investigation, or decision prep. |
| `Hotfix` | Emergency production fix. |

Documentation-only and test-only work should be clear from the issue title, body, and acceptance
criteria. Do not create a second type taxonomy for agents.

## Expected Workstream Shape

For the First Value implementation project, parent issues should mirror the workstreams in
`docs/specs/agent-workstreams.md`:

| Parent issue | Scope |
| --- | --- |
| `W0 - Tooling, CI, and Supply Chain` | Package manager, validation, CI, scanning, supply-chain posture. |
| `W1 - Persistence, Tenant Boundary, and Operations State` | Neon Postgres, RLS, Tenant-Scoped Store, Operation Store. |
| `W2 - Human Identity, Authorization, and Onboarding` | WorkOS, Memberships, Effective Access, Guided Organization Provisioning. |
| `W3 - Key Custody, Keyring, Encryption, and Storage Security Gate` | Key hierarchy, envelope encryption, custody readiness. |
| `W4 - Secret Lifecycle and Version Store` | Secret Shape, Secret Version Store, non-protected write path. |
| `W5 - CLI, Local Config, and Runtime Injection` | CLI framework, local config, one-use Runtime Injection grants. |
| `W10 - Audit, Evidence, and Release Gates` | Audit writer, security evidence, release-gate support. |

Later milestone projects may add W6, W7, W8, and W9 parent issues when those areas become active.

## MCP Capabilities

Linear MCP tools can read and update the workflow data agents need: issues, projects, documents,
comments, relationships, delegation, labels on issues, priority, status, parent issues, and links.
Agents should not depend on Linear UI-only configuration such as saved views, issue templates, or
agent guidance settings.
