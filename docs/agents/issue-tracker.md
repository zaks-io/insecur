# Issue tracker: Linear

Issues and PRDs for this repo live in Linear project INS-. Use the Linear MCP server for all operations.

## Conventions

- **Create an issue**: Use `save_issue` with `team: "INS"` to create issues in the project.
- **Read an issue**: Use `get_issue` with the issue ID (e.g., `INS-123`).
- **List issues**: Use `list_issues` with appropriate filters like `team: "INS"`, `state`, `assignee`, etc.
- **Comment on an issue**: Use `save_comment` with the issue ID.
- **Apply / remove labels**: Use `save_issue` with the `labels` parameter.
- **Close**: Use `save_issue` with `state: "Done"` or appropriate completed state.

## When a skill says "publish to the issue tracker"

Create a Linear issue in project INS-.

## When a skill says "fetch the relevant ticket"

Use `get_issue` with the Linear issue ID.
