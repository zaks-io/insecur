# Repo-Local Skills

This repo keeps executable agent workflows under `skills/*/SKILL.md`. They are repo-local skills:
an agent should read the named skill when the user asks for that workflow, even if the runtime does
not auto-install repo skills.

For the end-to-end flow across roadmap, readiness, implementation, review, the queue-moving loop,
the main-fix queueing loop, and doc sync, read `docs/agents/workflow.md`.

## Available Skills

| Skill | Use when |
| --- | --- |
| `insecur-roadmap-to-linear` | Turning docs/specs into Linear projects, parent issues, implementation issues, labels, and dependencies. |
| `insecur-linear-readiness-audit` | Auditing Linear issues for repo label coverage, readiness, blockers, statuses, and body completeness. |
| `insecur-implement-issue` | Implementing one `Todo` + `ready-for-agent` Linear issue as one PR. |
| `insecur-local-code-review` | Reviewing local changes or an implementation branch before opening a PR. |
| `insecur-review-pr` | Reviewing a PR against its Linear issue, security invariants, tests, and docs. |
| `insecur-goal-keep-agent-queue-moving` | Keeping the implementation queue moving across Linear, delegated agents, PRs, checks, and review feedback. |
| `insecur-goal-review-main-and-queue-fixes` | Reviewing new `main` commits on a periodic loop and queueing actionable fixes in Linear. |
| `insecur-doc-sync` | Keeping Codex, Claude, Cursor, repo skills, and `docs/agents` instructions aligned. |

## Recurring Loops To Run

Run these side by side:

- `insecur-goal-keep-agent-queue-moving` keeps Linear, delegated agents, PRs, checks, and review
  feedback moving.
- `insecur-goal-review-main-and-queue-fixes` reviews newly landed `main` commits and queues
  actionable fixes in Linear.

## How To Run A Repo Skill

1. Open the matching `skills/<skill-name>/SKILL.md`.
2. Read only the required context named by that skill.
3. Follow the workflow in the skill and the shared docs under `docs/agents`.
4. Prefer Linear issue fields and repo docs over memory or UI-only configuration.

## Shared Linear Defaults

Use team `INS`. Every issue for this repo must carry label `zaks-io/insecur`.

Use the current INS status contract from `docs/agents/autonomous-loop.md`:

- `Triage`
- `Backlog`
- `Todo`
- `In Progress`
- `Blocked`
- `In Review`
- `Changes Requested`
- `Ready to Merge`
- `Done`
- `Canceled`
- `Duplicate`

## Runtime Neutrality

Issues should not depend on Codex, Claude, or Cursor. Put runtime hints in the issue body only when
they matter. The orchestrator may choose a compatible runtime based on issue shape, risk, and
contention.
