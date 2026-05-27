# Issue tracker: Linear

Issues and PRDs for this repo live in Linear team `INS`. Use the Linear MCP server for all
operations. Autonomous implementation agents must follow `docs/agents/autonomous-loop.md`.

## Projects

- `Customer Discovery & Design Partners` tracks discovery, design-partner onboarding, evidence
  review, and scope-gate work.
- `First Value Build` tracks agent-build work for the First Value proof.
- `Production Delivery Foundation` tracks tenant, auth, key, storage, protected-environment, and
  Storage Security Gate foundation work.
- `Machine Access and CI Trust` tracks machine identities, deploy keys, GitHub Actions OIDC, and
  scoped CI access.
- `Runtime Injection Delivery` tracks profile-backed local and deploy runtime injection.
- `Provider Sync: GitHub and Cloudflare` tracks active provider sync for GitHub Actions and direct
  Cloudflare Worker secrets.
- `Approval UX and Delivery Policy` tracks the Human Approval Surface, High-Assurance Challenges,
  and Delivery Risk Policy Presets.
- `Audit, Runbooks, and Release Gates` tracks audit export, tested restore evidence, runbooks, and
  production release gates.

The First Value ticket graph and dependency order are documented in
`docs/specs/first-value-ticket-plan.md`. The Linear project and milestone scaffold plus publishing
checklist are documented in `docs/agents/linear-ticketing.md`.

## Deferred scope

Deferred work is tracked in the repo, not in Linear. The source of truth is
`docs/phasing.md#deferred-scope-parking-lot`.

Do not create Linear projects, project milestones, parent issues, implementation issues, or
placeholder tickets for items still listed there. To work on a deferred item, first promote it in
the repo docs by removing it from the deferred parking lot and adding a concrete product outcome to
the decided scope or build order. Only then create Linear scaffolding.

Active-scope issues may mention deferred work only to preserve additive seams; they must not build
or track the deferred behavior itself.

## Conventions

- **Create an issue**: Use `save_issue` with `team: "INS"` to create issues in the project.
- **Read an issue**: Use `get_issue` with the issue ID (e.g., `INS-123`).
- **List issues**: Use `list_issues` with appropriate filters like `team: "INS"`, `state`, `assignee`, etc.
- **Comment on an issue**: Use the Linear comment tool with the issue ID.
- **Apply / remove labels**: Use `save_issue` with the `labels` parameter.
- **Close**: Use `save_issue` with `state: "Done"` or appropriate completed state.

## Repo label

Every Linear issue for this repo must carry the repo routing label `zaks-io/insecur`. Preserve that
label when updating labels. Agents and orchestrators should filter on it before considering an
issue part of this repo's queue.

## Parent issues and dependencies

- Use parent issues for workstreams such as `W0 - Tooling, CI, and Supply Chain`.
- Do not create workstream labels.
- Parent workstream issues are containers: keep them in `Backlog` with only `zaks-io/insecur`, no
  readiness label, no Type/risk label, and no milestone.
- Assign every non-container issue in an active project to a project milestone.
- Publish blockers before blocked issues so child descriptions can cite real issue IDs.
- Use `blockedBy` and `blocks` relationships for ordering.
- Keep blocked implementation issues in `Backlog` without `ready-for-agent`.
- Move an implementation issue to `Todo` and add `ready-for-agent` only after all blockers are
  `Done` and the issue still satisfies the agent-ready contract.

## MCP scope

The Linear MCP can create and update issues, projects, documents, comments, relationships,
delegation, labels on issues, priority, status, parent issues, and links.

Agents should treat Linear as workflow data: queue, state, assignment, hierarchy, and dependency
tracking. Do not depend on saved views, issue templates, or other UI-only configuration to
understand the work.

## When a skill says "publish to the issue tracker"

Create a Linear issue in team `INS` and the appropriate project.

## When a skill says "fetch the relevant ticket"

Use `get_issue` with the Linear issue ID.
