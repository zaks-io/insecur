# Repo-Local Skills

This repo exposes executable agent workflows under `skills/*/SKILL.md`. Only `ziw-*` skills are
supported; an agent should read the named skill when the user asks for that workflow, even if the
runtime does not auto-install repo skills.

For the end-to-end flow across triage, implementation, review, the queue-moving loop, and the
main-fix review loop, read `docs/agents/workflow.md`.

These are shared ziw skills maintained outside this repo and used across projects. Treat their
`SKILL.md` files as the source of truth for each workflow.

## Available Skills

| Skill             | Use when                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `ziw-setup`       | Creating or refreshing the repo-local agent config the other ziw skills read.                        |
| `ziw-to-issues`   | Turning specs, PRDs, or epic tickets into dependency-ordered one-PR implementation tickets.          |
| `ziw-triage`      | Auditing issues for readiness, labels, blockers, dependencies, body shape, and verified stale state. |
| `ziw-implement`   | Implementing one `Todo` + `ready-for-agent` Linear issue as one PR.                                  |
| `ziw-code-review` | Bug-focused review of a diff, branch, PR, or main-branch commit range.                               |
| `ziw-pr`          | Opening, refreshing, or shipping the current branch as a PR with checks and Conventional Commits.    |
| `ziw-orchestrate` | Orchestrating implementation work across Linear, delegated agents, PRs, checks, and feedback.        |
| `ziw-review`      | Reviewing new `main` commits and PRs on a loop and creating tracker issues for the queue.            |

## Recurring Loops To Run

Run these side by side:

- `ziw-orchestrate` keeps Linear, delegated agents, PRs, checks, and review feedback moving.
- `ziw-review` reviews newly landed `main` commits and PRs and queues actionable fixes in
  Linear.

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
