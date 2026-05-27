---
name: insecur-orchestrator
description: Use when designing, simulating, or running the insecur orchestration loop that polls Linear, selects ready work, delegates agents, watches PRs, and updates issue state.
---

# Insecur Orchestrator

Coordinate work; do not make product decisions.

## Required Context

Read these first:

- `AGENTS.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/environment-adapters.md`
- `docs/agents/skill-usage.md`

## Loop

On each run:

1. List INS issues with `zaks-io/insecur`.
2. Find `Todo` issues with `ready-for-agent`, no blockers, and no active assignee/delegate.
3. Find active `In Progress`, `Blocked`, `In Review`, and `Ready to Merge` issues.
4. Check PR state for active work before starting new work.
5. Select work by priority, dependency order, milestone focus, risk, and file/package contention.
6. Choose an executor runtime:
   - Cursor for isolated remote implementation.
   - Codex for local repo edits, verification, and orchestration maintenance.
   - Claude for planning, docs/spec refinement, or second-pass review.
7. Build a prompt package from the issue, linked docs, repo instructions, and runtime adapter.
8. Delegate the work and record the run in a Linear comment.
9. Watch for PRs, failed checks, stale branches, blockers, and review comments.
10. Update Linear state using the status contract in `docs/agents/autonomous-loop.md`.

## Escalation

Escalate to a human instead of improvising when work needs:

- product scope decisions
- security posture changes
- credentials or provider approval
- ADR changes
- customer judgment
- merge authority

## Guardrails

- Never assign blocked work to an implementation agent.
- Never delegate an issue without `zaks-io/insecur`.
- Never add `ready-for-agent` unless the issue body contract is satisfied.
- Never merge PRs unless a human explicitly grants that authority.
