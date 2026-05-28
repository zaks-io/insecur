# Agent Workflow

This repo is meant to be usable by Codex, Claude, Cursor, and later an orchestrator. The shared
workflow lives in repo docs and repo-local skills, not in one tool's private prompt.

## Source Of Truth

- Product direction: `docs/vision.md`, `docs/project-status.md`, and the relevant specs or ADRs.
- Fast repo navigation: `docs/agents/repo-navigation.md`.
- Domain map: `CONTEXT-MAP.md` and local package/app `CONTEXT.md` files.
- Issue queue: Linear team `INS`, filtered by repo label `zaks-io/insecur`.
- Agent protocol: `docs/agents/*`.
- Executable workflows: `skills/*/SKILL.md` (shared `workflow-*` skills).
- Runtime adapters: `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/insecur.mdc`.

Runtime adapters should stay short. If the workflow changes, update shared docs and skills first.

## Work Flow

Work moves through this repo in five stages plus one sidecar review loop.

1. Triage And Roadmap

   Use `skills/workflow-issue-triage/SKILL.md` to turn docs, specs, ADRs, and project status into
   Linear projects, parent workstream issues, implementation issues, labels, and dependencies, and
   to audit existing issues for readiness. Workstreams are parent issues, delivery gates are project
   milestones, and execution order is represented with Linear relationships. Do not use labels for
   workstreams. Do not create Linear scaffolding for anything still listed in
   `docs/phasing.md#deferred-scope-parking-lot`; promote it in the repo docs first. An agent-ready
   issue must be `Todo`, unblocked, labeled `zaks-io/insecur`, labeled `ready-for-agent`, and
   satisfy the issue body contract in `docs/agents/autonomous-loop.md`.

2. Implementation

   Use `skills/workflow-agent-implement/SKILL.md` for one Linear issue and one branch. The agent
   claims the issue, moves it to `In Progress`, creates an `ins-<number>-<short-slug>` branch,
   implements only the stated scope, and runs required checks.

3. Pre-PR Local Review

   Use `skills/workflow-code-review/SKILL.md` to review the local branch or working-tree diff
   before opening a PR. This catches issue-scope problems, missed acceptance criteria, weak tests,
   security invariant gaps, debug output, and unrelated cleanup while the issue is still
   `In Progress`.

4. PR

   Use `skills/workflow-create-pr/SKILL.md` to open or refresh the PR, then `skills/workflow-code-review/SKILL.md`
   to review it against the Linear issue, acceptance criteria, security invariants, tests, and
   changed docs. If review finds actionable feedback, post it on the PR, move Linear to
   `Changes Requested`, and send the original Cursor agent thread back to the same branch and PR.
   Move to `Ready to Merge` only after review feedback is addressed and required checks pass.

5. Orchestration

   Use `skills/workflow-agent-queue/SKILL.md` when coordinating multiple agents. The queue polls
   Linear, selects `Todo` + `ready-for-agent` issues with no blockers, uses Cursor Composer 2.5 as
   the default implementation workhorse where it fits, watches PRs and checks, updates Linear, loops
   feedback back to the original Cursor agent thread, and escalates human decisions.

6. Review Main And Queue Fixes Sidecar

   Use `skills/workflow-agent-review/SKILL.md` for the periodic review agent that checks
   `origin/main` for new commits, reviews only the newly landed range from a disposable worktree,
   and files actionable Linear issues for bugs, security regressions, or product-direction drift.
   Issues created by this loop must still satisfy the normal Linear contract before they receive
   `ready-for-agent`; otherwise they stay in `Triage` or `Backlog` with the appropriate readiness
   label.

## Orchestrator Review Loop

For delegated implementation work, the preferred loop is:

1. The orchestrator assigns or delegates a ready Linear issue to Cursor.
2. Cursor runs the remote implementation environment through Composer 2.5 by default when the
   issue is implementation-heavy, well scoped, and does not require new product or security
   judgment.
3. Before PR handoff, the implementation branch gets a local review pass with
   `skills/workflow-code-review/SKILL.md` where the environment supports it.
4. Cursor opens a PR, comments in Linear, and moves the issue to `In Review`.
5. The orchestrator checks out the PR in a local worktree and launches a review subagent with
   `skills/workflow-code-review/SKILL.md`, using the strongest available code-review model and
   reasoning tier, such as Opus-class, GPT-5.5 extra-high reasoning, or the current best
   equivalent.
6. Review findings are posted as normal GitHub PR review comments.
7. If changes are needed, Linear moves to `Changes Requested`.
8. The orchestrator replies in the original Cursor agent thread with the PR feedback and required
   next checks, so the same environment and branch continue.
9. Cursor pushes fixes to the same PR.
10. The orchestrator repeats local worktree review until the PR is clean enough.
11. When checks and review are clean, Linear moves to `Ready to Merge` and the configured merge
    policy decides whether the orchestrator may merge or must escalate to a human.

The local orchestrator should maximize throughput by unblocking PRs, keeping review quality high,
and routing ordinary fixes back to the assigned agent. It should not quietly become the local
implementer for a stuck PR unless a human explicitly redirects it or the original agent thread is no
longer usable.

Composer 2.5 is the preferred fast, economical implementation runner for agent-ready tickets. The
orchestrator is the quality gate: it verifies that the issue was interpreted correctly, acceptance
criteria are satisfied, security invariants hold, tests are meaningful, code quality is high, and
important risks are surfaced to the user.

Implementation and review should use different defaults. Composer 2.5 is the workhorse for
well-scoped implementation. PR review should use the strongest available review tier. If only a
lower-tier reviewer is available, the orchestrator must say so and should not move security,
schema, or cross-cutting PRs to `Ready to Merge` without a stronger review pass or explicit human
approval.

## Skill Selection

Start by choosing the smallest skill that matches the task:

| Task                                               | Skill                      |
| -------------------------------------------------- | -------------------------- |
| Convert docs/specs into Linear work or audit it    | `workflow-issue-triage`    |
| Implement one ready issue                          | `workflow-agent-implement` |
| Review a diff, branch, or PR                        | `workflow-code-review`     |
| Open or ship the current branch as a PR            | `workflow-create-pr`       |
| Keep the agent implementation queue moving         | `workflow-agent-queue`     |
| Review newly landed `main` commits and queue fixes | `workflow-agent-review`    |

If no skill matches, use the shared docs directly and keep the change narrow.

## Linear State Rules

Use `docs/agents/autonomous-loop.md` as the detailed state contract.

- `Triage`: intake; sort before implementation.
- `Backlog`: planned or blocked-by-default work; do not claim.
- `Todo`: claimable only with `ready-for-agent` and no blockers.
- `In Progress`: active implementation.
- `Blocked`: visible blocker; no improvising around missing decisions.
- `In Review`: PR opened and ready for review.
- `Changes Requested`: PR has actionable feedback; return to the original agent thread for fixes.
- `Ready to Merge`: checks and review are complete.
- `Done`: merged or otherwise complete.
- `Canceled` or `Duplicate`: closed; do not modify without a new reason.

Every repo issue must carry `zaks-io/insecur`. Preserve that label whenever updating labels.

## Agent Boundaries

Agents may execute clearly bounded work. They may not reshape product scope, security posture, or
domain language while implementing an issue.

Stop and escalate when work needs:

- product scope decisions
- security posture changes
- credentials or provider approval
- ADR changes
- customer judgment
- merge authority

Create follow-up Linear issues for discovered adjacent work instead of expanding the current PR.

## Security Baseline

Never store, print, log, fixture, screenshot, or summarize Sensitive Values. Do not add reveal
paths, plaintext exports, local secret files, debug decrypt paths, or unsafe development shortcuts.

Issue bodies, PR descriptions, comments, logs, tests, and screenshots must stay metadata-only.

## Keeping Docs In Sync

After workflow changes, update shared docs before changing runtime adapters. Then verify that
`AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/insecur.mdc` all point back to the same shared
protocol.
