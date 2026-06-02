# Agent Config

Last updated: 2026-06-01

Workflow lookup table for the shared `workflow-*` skills. Values are verified
unless marked inferred or listed under Unknowns. State authority lives in the
external systems (Linear, GitHub, CI), not here.

## Verification

- Scope: refresh of existing config; full re-verify of repo identity, commands, tracker metadata, adapter symlinks, and the agent role names.
- Last verified: 2026-05-28.
- Evidence sources: `package.json`, `.npmrc`, git remote/branch, `AGENTS.md`/`CLAUDE.md` symlinks, `.agents/skills/*` + `.claude/skills/*` + root `skills/*` symlinks, live Linear `list_teams`/`list_issue_statuses`/`list_issue_labels`.
- Safe commands run: `git remote get-url origin`, `git symbolic-ref --short HEAD`, `jq` over `package.json`, `ls -la`/`-ef` symlink checks, `git log`/`diff`/`wc` over skills.
- Read-only tool calls: Linear `list_teams (INS)`, `list_issue_statuses (INS)`, `list_issue_labels (INS, 100)` — all IDs below confirmed unchanged.
- Inferred values: none.
- Critical unknowns: none.

## Repo

- Name: insecur
- Remote: git@github.com:zaks-io/insecur.git
- Default branch: main
- Branch prefix: `ins-<number>-<short-slug>` (one Linear issue per branch)
- Package manager: pnpm@10.19.0 (corepack), Node `>=24 <25` (`engine-strict=true`)
- Install: `pnpm install --frozen-lockfile`
- Full local gate: `pnpm verify` (duplicate warnings + format:check + turbo lint typecheck test)
- Focused checks: `pnpm typecheck`; `pnpm lint`; `pnpm test`; `pnpm dev:check`; `pnpm duplicates:check`
- Build: `pnpm build` (includes Worker dry-run deploy via apps/worker/wrangler.jsonc)
- Generated artifacts: none tracked; turbo cache only
- Preview checks: none wired; hosted `validate` and `security-daily` workflows exist, but no preview deploy exists yet
- Production deploy path: `pnpm deploy:worker` (Cloudflare Worker `insecur-worker`); approval required
- Production approval required: yes

## Issue Tracker

- Provider: Linear (Linear MCP server)
- Provider location: team `INS` ("Insecur"), id `bfbdcafe-cafe-41a4-b35a-30d3f8f6a0b0`
- Metadata verified: 2026-05-28 via list_teams, list_issue_statuses, list_issue_labels, list_projects
- Label source of truth: live Linear team `INS` label metadata
- Label docs: `docs/agents/triage-labels.md` (mirror; covers readiness subset — see Unknowns)
- Routing label: `zaks-io/insecur` (id `498e1661-64bb-4b1e-b3ca-3883dd6aa7a3`, parent `repo`); required on every repo issue, preserve on updates
- Triage scope: filter the `INS` queue by `zaks-io/insecur` before treating an issue as this repo's work
- Orphan policy: route only when project/team/parent/label is directly evidenced; else leave in `Triage` with `needs-info` or `ready-for-human`; never `ready-for-agent` until routing, body, and labels are correct. Encode status and blockers separately.
- Issue key examples: INS-16, INS-34, INS-35

### Statuses (verified IDs)

- Triage: `cb2877b3-df50-48c5-a365-70a905e5885b`
- Backlog: `731d29c4-7408-47fb-82e5-a556b2b67ae8`
- Todo (ready state): `013bffd1-af93-43e3-9e7c-df693d0a528c`
- In Progress: `de975a93-d3f8-4f70-aacf-23d5f4444a77`
- Blocked: `8b19f54a-55bd-491d-8b7a-fd59a4b5c2bb`
- In Review: `4f27a394-0553-4ccc-b7d8-79246e371132`
- Changes Requested: `972aa5b4-5209-45fb-a63e-7be92b459130`
- Ready to Merge (merge-ready state): `b854f5bb-70e4-4c76-b1f4-37bc5d410d4f`
- Done: `a11aa832-77cd-4b46-961f-ca72a0452323`
- Canceled: `b2aad859-a2f2-4ce5-96e6-6609bb43232e`
- Duplicate: `bc00d6f5-a56f-444f-8a5d-cb73b7c9a508`

### Labels (verified IDs)

Readiness (parent `Readiness`):

- needs-triage `0f3d30ec-e60f-4782-8146-66b71122b4ea`
- needs-info `7cada386-964d-40dc-94d4-2c45f2db834c`
- ready-for-agent `45bb65be-aa4a-4357-9d32-54b996813452`
- ready-for-human `30de6f2d-ac9e-4384-a751-1c5c08ce47f0`
- wontfix `d219cd4b-27a2-4a20-960d-b9b1ff43fa49`
- remote worker: `remote-cursor` `7ca081c9-f1fb-45ba-a6a4-751e3dc30fec` (no `Readiness` parent; this repo uses Cursor as the remote worker)

### Label Policies

- `ready-for-agent`: no further human refinement is needed before agent handoff; does not mean unblocked or startable.
- `remote-cursor`: approved to run in the remote Cursor environment; does not mean unblocked or startable.
- Startable work criteria: `Todo`, `ready-for-agent`, complete agent-ready body, no active blockers, no active claim, and no open PR.

Risk (no parent):

- risk-normal `eba9f5cf-b2d5-44b9-9866-10cee1b395ab`
- risk-security-sensitive `3dbff4e4-bdb3-435e-9cc2-68e332a7f252`
- risk-schema `e5bfaa62-80ef-4f7a-8d32-5cbbfdf6896e`
- risk-cross-cutting `5617445a-3891-4c44-889d-296aee6e4828`

Type (parent `Type`):

- Bug `6828da22-1f94-47d1-8042-b2d95d40de71`
- Feature `da876536-9d8f-486e-8f1d-910fbd782522`
- Improvement `3b390b40-f8ba-471d-909a-881bc8c41957`
- Tech Debt `2eb30d36-9331-4fc6-b64e-8e19cfbde5f7`
- Spike `de02dd0a-55a1-4faa-a6cd-64c07b50f66b`
- Hotfix `6623d242-b70f-439c-ae17-3fe0419b6c23`

### Projects (verified IDs)

- Customer Discovery & Design Partners: `1867c85a-806d-468a-9269-b5904bd66ff6`
- First Value Build: `d1576893-c3e8-4528-8d9e-8327015011dc`
- Production Delivery Foundation: `e69d825d-bd55-448d-a215-3f2a48333a1a`
- Machine Access and CI Trust: `4279414c-a1e9-465e-8d22-900cca46f56a`
- Runtime Injection Delivery: `8a8c3c00-95cd-465d-875b-b489a0a15cde`
- Provider Sync: GitHub and Cloudflare: `f17641b3-632c-47fe-948a-897493f8bb91`
- Approval UX and Delivery Policy: `62266e4b-2885-4459-a3e1-eccd1c0cdef5`
- Audit, Runbooks, and Release Gates: `a086be98-10e4-49c4-8ab3-ae2a110e1218`

Project field model, milestones, and parent workstreams: see `docs/agents/linear-ticketing.md`
and `docs/agents/issue-tracker.md`. Deferred scope is repo-tracked, not in Linear:
`docs/phasing.md#deferred-scope-parking-lot`.

- Priority policy: no agent priority automation; humans set priority
- Dependency policy: encode order with Linear `blockedBy` / `blocks`; not labels. Blocked work may keep `ready-for-agent`; dependency state controls scheduling, not readiness metadata.
- Agent-ready issue body: contract in `docs/agents/linear-ticketing.md#issue-body-contract` and `docs/agents/autonomous-loop.md` (Outcome, Context, In scope, Out of scope, Acceptance criteria, Required checks, Security invariants, Dependencies)
- Status transition owner: Agent Orchestrator (`workflow-agent-orchestrator`)
- Labels are signals, not authority: Linear status is the workflow source of truth; Agent Orchestrator owns transitions

## Work Coordination

- Authoritative issue state: Linear team `INS`
- Authoritative PR state: GitHub `zaks-io/insecur`
- Authoritative check state: local `pnpm verify` plus hosted GitHub `validate`; duplicate-code CI annotations are warning-only for now
- Authoritative deploy state: Cloudflare (Worker `insecur-worker`)
- Orchestrator mutation authority: Agent Orchestrator only
- Implement authority: Agent Implement (one issue per branch/PR)
- Review authority: Agent Review (clean context / disposable worktree)
- Merge authority: human (no auto-merge; Agent Orchestrator may move to Ready to Merge only)
- Claim record: Linear assignment/delegation + claim comment + In Progress status
- Orchestrator local state: non-authoritative scratch/checkpoints only; refresh Linear/GitHub before acting
- Friction log: Linear issue `INS-99` (`Agent Orchestrator friction log`), parked in `Canceled`; append metadata-only comments
- Handoff format: see `docs/agents/workflow/` handoff shape (Issue, Branch, PR, Owner, Runtime, Environment, Current state, Next owner, Next action, Files changed, Checks, Code review, Tracker updates, Blockers, Residual risk)

## Agent Runtimes

- Local Codex: local edits, verification, Linear maintenance, orchestration, careful review (reads `AGENTS.md`)
- Remote worker: Cursor Composer 2.5 (default implementation workhorse for startable issues); label `remote-cursor`; resume same thread/branch/PR on Changes Requested
- Claude: planning, spec work, second-pass review (reads `CLAUDE.md`)
- Claude Code source of truth: `.claude/` in this repo; `.claude/skills/*` symlink to `.agents/skills/*` (canonical)
- Claude Code imports: project `CLAUDE.md`; `AGENTS.md` is a symlink to `CLAUDE.md` (one file, cannot drift), so Codex and Claude read the same adapter
- Claude Code symlinks: `.claude/skills/workflow-*` -> `../.agents/skills/workflow-*`; root `skills/workflow-*` -> `../.agents/skills/workflow-*` (verified resolving 2026-05-28; all SKILL.md identical by md5)
- Claude Code verification: `AGENTS.md -ef CLAUDE.md` confirmed (symlink); `.claude/skills/*` and `.agents/skills/*` md5 match confirmed
- Review model policy: implementation uses Composer 2.5; PR review uses strongest available tier (Opus-class / GPT-5.5 extra-high or current best). Do not move security/schema/cross-cutting PRs to Ready to Merge on a weak review without explicit human approval
- Agent Orchestrator: `workflow-agent-orchestrator` (status-transition owner; replaced the former Agent Queue skill)
- Agent Review: `workflow-agent-review`
- Agent Implement: `workflow-agent-implement`

## Pull Requests

- PR title: Conventional Commits; reference issue (e.g. `feat(cli): ... (INS-NN)`)
- PR body: Summary, Changes, Risk, Test plan; metadata-only (no Sensitive Values)
- Required checks: `pnpm verify` locally; run strict `pnpm duplicates:check` when touching repeated logic or shared helpers
- Code review: `workflow-code-review` pre-PR (self) and on the PR (Agent Review, clean context)
- CodeRabbit: not wired; escalate to `/code-review ultra` or human for high-risk PRs
- Issue update: Agent Orchestrator moves Linear status; In Review on PR open, Changes Requested on feedback, Ready to Merge when clean
- Merge authority: human

## Environments

- Local: self-contained
- Local commands: `pnpm dev:worker` (http://localhost:8787/healthz, scaffold only); `pnpm dev:db:reset` (Postgres 17 Docker Compose, local-only role guard)
- Local services: local Postgres 17 (iteration aid only; ADR-0060 pins 17 until Neon supports 18)
- Development: may use cloud backing services while app runs locally
- Development backing services: Neon Postgres (real RLS tests need `DATABASE_URL_RUNTIME`, start at FV-04); Cloudflare Workers
- Preview: none (no preview deploy wired)
- Preview purpose: n/a until FV-02
- Production: explicit approval required
- Production forbidden without approval: `pnpm deploy:worker`, any Cloudflare/Neon production mutation, secret/key material changes
- Hosted checks allowed without approval: read-only Linear MCP, read-only GitHub, local `pnpm verify`, Worker dry-run via `pnpm build`
- Hosted checks requiring approval: any production deploy, any write to Cloudflare or Neon production

## Security Baseline

Never store, print, log, fixture, screenshot, or summarize Sensitive Values anywhere, including
Linear prose, PR bodies, comments, and tests. No reveal/plaintext-export/debug-decrypt paths. See
`docs/agents/workflow.md#security-baseline` and `skills/workflow-secret-redaction`.

## Unknowns

- [ ] No hosted CI / preview / secret+dependency scanning (FV-02 owns). Required-check enforcement is local-only until then.
