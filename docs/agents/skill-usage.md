# Repo-Local Skills

This repo exposes executable agent workflows under `skills/*/SKILL.md`. They are shared workflow
skills (symlinked into the repo): an agent should read the named skill when the user asks for that
workflow, even if the runtime does not auto-install repo skills.

For the end-to-end flow across triage, implementation, review, the queue-moving loop, and the
main-fix review loop, read `docs/agents/workflow.md`.

These are shared workflow skills maintained outside this repo and used across projects. Treat their
`SKILL.md` files as the source of truth for each workflow.

## Available Skills

| Skill                       | Use when                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `workflow-setup`            | Creating or refreshing the repo-local agent config the other workflow skills read.                      |
| `workflow-issue-triage`     | Turning docs/specs into tracker work and auditing issues for readiness, labels, blockers, and statuses. |
| `workflow-agent-implement`  | Implementing one `Todo` + `ready-for-agent` Linear issue as one PR.                                     |
| `workflow-code-review`      | Bug-focused review of a diff, branch, PR, or main-branch commit range.                                  |
| `workflow-create-pr`        | Opening, refreshing, or shipping the current branch as a PR with checks and Conventional Commits.       |
| `workflow-agent-queue`      | Keeping the implementation queue moving across Linear, delegated agents, PRs, checks, and feedback.     |
| `workflow-agent-review`     | Reviewing new `main` commits and PRs on a loop and creating tracker issues for the queue.               |
| `workflow-secret-redaction` | Redacting or inspecting secret-bearing files and values without exposing them.                          |

## Recurring Loops To Run

Run these side by side:

- `workflow-agent-queue` keeps Linear, delegated agents, PRs, checks, and review feedback moving.
- `workflow-agent-review` reviews newly landed `main` commits and PRs and queues actionable fixes in
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
