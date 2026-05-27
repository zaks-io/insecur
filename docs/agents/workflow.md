# Agent Workflow

This repo is meant to be usable by Codex, Claude, Cursor, and later an orchestrator. The shared
workflow lives in repo docs and repo-local skills, not in one tool's private prompt.

## Source Of Truth

- Product direction: `docs/vision.md`, `docs/project-status.md`, and the relevant specs or ADRs.
- Domain map: `CONTEXT-MAP.md` and local package/app `CONTEXT.md` files.
- Issue queue: Linear team `INS`, filtered by repo label `zaks-io/insecur`.
- Agent protocol: `docs/agents/*`.
- Executable workflows: `skills/*/SKILL.md`.
- Runtime adapters: `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/insecur.mdc`.

Runtime adapters should stay short. If the workflow changes, update shared docs and skills first.

## Work Flow

Work moves through this repo in five stages.

1. Roadmap

   Use `skills/insecur-roadmap-to-linear/SKILL.md` to turn docs, specs, ADRs, and project status
   into Linear projects, parent workstream issues, implementation issues, labels, and dependencies.
   Workstreams are parent issues or project milestones, not labels.

2. Readiness

   Use `skills/insecur-linear-readiness-audit/SKILL.md` to check whether issues are actually ready
   for autonomous work. An agent-ready issue must be `Todo`, unblocked, labeled
   `zaks-io/insecur`, labeled `ready-for-agent`, and satisfy the issue body contract in
   `docs/agents/autonomous-loop.md`.

3. Implementation

   Use `skills/insecur-implement-issue/SKILL.md` for one Linear issue and one PR. The agent claims
   the issue, moves it to `In Progress`, creates an `ins-<number>-<short-slug>` branch, implements
   only the stated scope, runs required checks, opens a PR, comments in Linear, and moves the issue
   to `In Review`.

4. Review

   Use `skills/insecur-review-pr/SKILL.md` to review the PR against the Linear issue, acceptance
   criteria, security invariants, tests, and changed docs. Move to `Ready to Merge` only after
   review feedback is addressed and required checks pass.

5. Orchestration

   Use `skills/insecur-orchestrator/SKILL.md` when coordinating multiple agents. The orchestrator
   polls Linear, selects `Todo` + `ready-for-agent` issues with no blockers, chooses Codex, Claude,
   or Cursor based on the work shape, watches PRs and checks, updates Linear, and escalates human
   decisions.

## Skill Selection

Start by choosing the smallest skill that matches the task:

| Task | Skill |
| --- | --- |
| Convert docs/specs into Linear work | `insecur-roadmap-to-linear` |
| Audit labels, statuses, blockers, or readiness | `insecur-linear-readiness-audit` |
| Implement one ready issue | `insecur-implement-issue` |
| Review one PR | `insecur-review-pr` |
| Coordinate many issues or agent runs | `insecur-orchestrator` |
| Keep agent docs and runtime adapters aligned | `insecur-doc-sync` |

If no skill matches, use the shared docs directly and keep the change narrow.

## Linear State Rules

Use `docs/agents/autonomous-loop.md` as the detailed state contract.

- `Triage`: intake; sort before implementation.
- `Backlog`: planned or blocked-by-default work; do not claim.
- `Todo`: claimable only with `ready-for-agent` and no blockers.
- `In Progress`: active implementation.
- `Blocked`: visible blocker; no improvising around missing decisions.
- `In Review`: PR opened and ready for review.
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

Use `skills/insecur-doc-sync/SKILL.md` after workflow changes. Update shared docs and repo-local
skills before changing runtime adapters. Then verify that `AGENTS.md`, `CLAUDE.md`, and
`.cursor/rules/insecur.mdc` all point back to the same shared protocol.
