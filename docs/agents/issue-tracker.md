# Issue tracker: Linear

Issues and PRDs for this repo live in Linear team `INS`. Use the Linear MCP server for all
operations. Autonomous implementation agents must follow `docs/agents/autonomous-loop.md`.

## Projects

- `First Value Customer Validation` tracks discovery, design-partner onboarding, evidence review,
  and scope-gate work.
- `First Value Implementation` tracks agent-build work for the First Value Milestone.

The First Value ticket graph and dependency order are documented in
`docs/specs/first-value-ticket-plan.md`. The Linear publishing checklist is documented in
`docs/agents/linear-ticketing.md`.

## Conventions

- **Create an issue**: Use `save_issue` with `team: "INS"` to create issues in the project.
- **Read an issue**: Use `get_issue` with the issue ID (e.g., `INS-123`).
- **List issues**: Use `list_issues` with appropriate filters like `team: "INS"`, `state`, `assignee`, etc.
- **Comment on an issue**: Use `save_comment` with the issue ID.
- **Apply / remove labels**: Use `save_issue` with the `labels` parameter.
- **Close**: Use `save_issue` with `state: "Done"` or appropriate completed state.

## Parent issues and dependencies

- Use parent issues for workstreams such as `W0 - Tooling, CI, and Supply Chain`.
- Do not create workstream labels.
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
