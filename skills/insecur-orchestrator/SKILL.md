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
- `docs/agents/workflow.md`
- `docs/agents/environment-adapters.md`
- `docs/agents/skill-usage.md`

## Loop

On each run:

1. List INS issues with `zaks-io/insecur`.
2. Find `Todo` issues with `ready-for-agent`, no blockers, and no active assignee/delegate.
3. Find active `In Progress`, `Blocked`, `In Review`, `Changes Requested`, and `Ready to Merge`
   issues.
4. Check PR state for active work before starting new work.
5. Select work by priority, dependency order, milestone focus, risk, and file/package contention.
6. Choose an executor runtime:
   - Cursor Composer 2.5 as the default workhorse for isolated, well-scoped implementation.
   - Codex for local repo edits, verification, and orchestration maintenance.
   - Claude for planning, docs/spec refinement, or second-pass review.
7. Build a prompt package from the issue, linked docs, repo instructions, and runtime adapter.
8. Delegate the work and record the run in a Linear comment.
9. Require or run a pre-PR local review with `skills/insecur-local-code-review/SKILL.md` where the
   implementation environment supports it.
10. Watch for PRs, failed checks, stale branches, blockers, and review comments.
11. Update Linear state using the status contract in `docs/agents/autonomous-loop.md`.

## Review Loop

For a PR opened by a delegated Cursor agent:

1. Confirm the implementation branch received a pre-PR local review when feasible.
2. Create a local worktree for the PR.
3. Run a review subagent with `skills/insecur-review-pr/SKILL.md` using the strongest available
   code-review model and reasoning tier, such as Opus-class, GPT-5.5 extra-high reasoning, or the
   current best equivalent.
4. Post actionable findings as normal GitHub PR review comments.
5. Move Linear to `Changes Requested` when fixes are required.
6. Reply in the original Cursor agent thread whenever possible, so the same remote environment,
   branch, and PR continue.
7. Include the PR comments, failed checks, acceptance criteria gaps, and security concerns the
   agent must address.
8. After the agent pushes fixes, rerun review from a clean worktree and move the issue back to
   `In Review`.
9. Move to `Ready to Merge` only when review and required checks are clean.

The orchestrator should unblock and coordinate, not become the local implementer for ordinary
feedback. Escalate important product, security, or architectural issues to the user.

## Runtime Bias

Use Cursor Composer 2.5 whenever the issue is agent-ready, implementation-heavy, and locally or CI
verifiable. It is the default because it is fast and economical for ordinary backlog execution.

Do not route to Composer 2.5 by default when the issue needs new product judgment, security posture
changes, credentials, provider approval, ADR changes, or broad planning. Those should be escalated,
kept human-owned, or routed to a planning/review agent first.

The orchestrator remains responsible for quality: issue interpretation, code review, test quality,
security invariants, CI status, PR feedback loops, and surfacing important risks to the user.

Implementation can default to the fast economical workhorse. Review should not. Treat code review
as a high-skill gate and use the strongest available review tier before moving anything important
to `Ready to Merge`.

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
- Never start a fresh implementation agent for review fixes when the original Cursor thread is
  still available.
- Never merge PRs unless a human explicitly grants that authority.
