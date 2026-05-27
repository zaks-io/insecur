---
name: insecur-doc-sync
description: Use when keeping AGENTS.md, CLAUDE.md, Cursor rules, repo-local skills, and docs/agents instructions aligned for insecur agent workflows.
---

# Insecur Doc Sync

Keep agent instructions consistent across Codex, Claude, and Cursor.

## Required Context

Read these first:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/insecur.mdc`
- `docs/agents/workflow.md`
- `docs/agents/repo-navigation.md`
- `docs/agents/skill-usage.md`
- `docs/agents/environment-adapters.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`

## Sync Rules

- Shared workflow truth lives in `docs/agents/*` and `skills/*/SKILL.md`.
- `AGENTS.md`, `CLAUDE.md`, and Cursor rules are adapters; keep them short.
- Do not duplicate large workflow sections across runtime-specific files.
- If Linear labels, statuses, projects, or issue body contracts change, update:
  - `docs/agents/issue-tracker.md`
  - `docs/agents/linear-ticketing.md`
  - `docs/agents/autonomous-loop.md`
  - affected `skills/*/SKILL.md`
- If runtime behavior changes, update `docs/agents/environment-adapters.md` and only the affected
  adapter file.

## Verification

After edits:

- Search for stale status or label names.
- Confirm every runtime adapter points to the same shared docs.
- Confirm every repo-local skill has valid `name` and `description` frontmatter.
