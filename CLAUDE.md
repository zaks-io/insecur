# insecur

insecur is no-reveal secrets custody for teams shipping with agents and CI. See `docs/vision.md` for the north star: what this is, what it is trying to accomplish, and the overall direction of the repo.

## Agent skills

This repo has repo-local skills in `skills/*/SKILL.md`. If a task names one of those skills or
matches its description, read the matching skill before acting. See `docs/agents/skill-usage.md`.

Runtime-specific files are adapters only. Shared workflow truth lives in `docs/agents/*` and
`skills/*/SKILL.md`; keep Codex, Claude, and Cursor behavior aligned through those files.

### Workflow

The end-to-end repo workflow is documented in `docs/agents/workflow.md`: how to choose a skill,
move work through Linear, implement one issue, review PRs, and coordinate agents.

### Issue tracker

Issues are tracked in Linear project INS- using the Linear MCP server. See `docs/agents/issue-tracker.md`.

### Autonomous agent loop

Agents working from Linear must follow `docs/agents/autonomous-loop.md` for issue readiness,
claiming, blockers, PR handoff, and Linear setup conventions.

### Triage labels

This repo uses the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context domain doc layout rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.

### Project status

Current implementation status and next steps are tracked in `docs/project-status.md`.

### Cursor Cloud environment

Remote Cursor agent setup and maintenance notes live in `docs/agents/cursor-cloud-environment.md`.

### Environment adapters

Codex, Claude, and Cursor runtime differences are documented in
`docs/agents/environment-adapters.md`.
