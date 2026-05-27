# Agent Environment Adapters

The source of truth for agent behavior is shared:

- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/linear-ticketing.md`
- `docs/agents/repo-navigation.md`
- `docs/agents/workflow.md`
- `docs/agents/skill-usage.md`
- `skills/*/SKILL.md`

Runtime-specific files are adapters. Do not duplicate the shared workflow in them.

## Codex

Codex reads `AGENTS.md` automatically. Use Codex for local repo edits, verification, Linear
maintenance, queue-moving orchestration scripts, periodic main review that queues fixes, and
careful code review.

Codex agents should:

- read the relevant repo-local skill when named by the user or task
- use `docs/agents/repo-navigation.md` for fast orientation before broad repo exploration
- use Linear MCP tools for INS issue state
- use local shell verification before final handoff
- avoid changing unrelated files in a dirty worktree

## Claude

Claude and Claude Code should read `CLAUDE.md`. Use Claude for planning, roadmap refinement,
writing or critiquing specs, and second-pass review.

Claude agents should:

- treat `docs/agents/*` and `skills/*/SKILL.md` as the source of truth
- use `docs/agents/repo-navigation.md` to find the right spec, context file, or package owner
- avoid creating a separate Claude-only workflow
- preserve the Linear status and label contracts

## Cursor

Cursor and Cursor Background Agents should read `.cursor/rules/insecur.mdc` and the Cursor Cloud
environment notes in `docs/agents/cursor-cloud-environment.md`. Use Cursor Composer 2.5 as the
default workhorse for isolated remote implementation where the issue is already `Todo` +
`ready-for-agent`. Preserve the original thread for review fixes.

Cursor agents should:

- use `docs/agents/repo-navigation.md` before broad searching or reading unrelated ADRs
- implement one Linear issue per branch and PR
- resume the same thread, branch, and PR when the orchestrator sends `Changes Requested` feedback
- use the branch name shape `ins-<number>-<short-slug>`
- leave Linear comments for claim, blocker, and PR handoff
- stop on missing product, security, credential, provider, or ADR decisions

## Runtime Selection Hints

Use Cursor Composer 2.5 when the issue is isolated, well specified, implementation-heavy, and
locally or CI verifiable.

Use Codex when the task needs local verification, repo-wide cleanup, Linear/data maintenance, or
orchestrator development.

Use Claude when the task needs broad reasoning, docs synthesis, roadmap shaping, or independent
review.
