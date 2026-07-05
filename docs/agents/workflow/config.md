# Agent Config

Last updated: 2026-07-05

Workflow lookup table for the shared `ziw-*` skills. Values are verified
unless marked inferred or listed under Unknowns. State authority lives in the
external systems (Linear, GitHub, CI), not here.

## Verification

- Scope: refresh of existing config; full re-verify of repo identity, commands, tracker metadata, adapter symlinks, and the agent role names. 2026-06-14 reconciliation against the INS-99 friction log: added the coverage gate (`pnpm test:coverage`), squash merge method, orchestrator merge authority, `code-review-passed` label, `save_issue` quirk, worktree hygiene, and corrected the stale "no hosted CI" note. 2026-06-29 (INS-234): refreshed CodeRabbit wiring guidance to match active PR status contexts and orchestrator current-head manual review requests. 2026-07-01: added `pnpm ci:check` as a `pnpm verify` alias and documented docs-only CI short-circuiting. 2026-07-02: documented single-pass duplicate enforcement and workflow-only CI short-circuiting. 2026-07-05 (INS-406): corrected the dependency policy to match the shared issue-tracker contract; the prior wording parked blocked ready slices in `Backlog`, which no skill scans, so decomposed work was invisible to the orchestrator. The same backwards policy was restated across `docs/agents/workflow.md`, `issue-tracker.md`, `linear-ticketing.md`, `autonomous-loop.md`, `skill-usage.md`, and `environment-adapters.md`; per ziw-setup ("do not duplicate this whole workflow into adapter docs") those six docs are deleted, their repo-specific facts (project/milestone tables, workstream-parent conventions, security baseline) folded in here, and this file is the only repo-side workflow doc. Workflow logic lives in the shared `ziw-*` skills.
- Last verified: 2026-06-29 (CodeRabbit status context on open PRs; `.coderabbit.yaml` auto-review disabled).
- Evidence sources: `package.json`, `.npmrc`, git remote/branch, `AGENTS.md`/`CLAUDE.md` symlinks, `.agents/skills/*` + `.claude/skills/*` + root `skills/*` symlinks, live Linear `list_teams`/`list_issue_statuses`/`list_issue_labels`.
- Safe commands run: `git remote get-url origin`, `git symbolic-ref --short HEAD`, `jq` over `package.json`, `ls -la`/`-ef` symlink checks, `git log`/`diff`/`wc` over skills.
- Read-only tool calls: Linear `list_teams (INS)`, `list_issue_statuses (INS)`, `list_issue_labels (INS, 100)` — live IDs verified privately and intentionally omitted from public repo docs.
- Inferred values: none.
- Critical unknowns: none.

## Repo

- Name: insecur
- Remote: git@github.com:zaks-io/insecur.git
- Default branch: main
- Branch prefix: `ins-<number>-<short-slug>` (one Linear issue per branch)
- Package manager: pnpm@10.19.0 (corepack), Node `>=24 <25` (`engine-strict=true`)
- Install: `pnpm install --frozen-lockfile`
- Full local gate: `pnpm verify` or `pnpm ci:check` (single-pass annotated zero-duplicate gate + knip + actionlint + actions-pin conformance + deploy topology conformance + package-boundary conformance + site-boundary conformance + format:check + turbo lint typecheck test). `verify` does NOT include the coverage ratchet — that is the separate `pnpm test:coverage` job (thresholds lines 74 / fns 75 / stmts 74 / branches 62 in `scripts/merge-coverage.mjs`). Any PR touching covered packages must also pass `pnpm test:coverage`; CI runs it as its own `Coverage` job, and pre-push runs it locally, but the Cursor cloud worker skips push hooks, so run it explicitly before opening a PR.
- Focused checks: `pnpm conformance:actions-pin`; `pnpm conformance:packages`; `pnpm conformance:site-boundary`; `pnpm conformance:topology`; `pnpm typecheck`; `pnpm lint`; `pnpm test`; `pnpm test:coverage` (when the change touches covered packages); `pnpm dev:check`; `pnpm duplicates:check`
- Build: `pnpm build` (includes Worker dry-run deploys via apps/api/wrangler.jsonc and apps/runtime/wrangler.jsonc)
- Generated artifacts: none tracked; turbo cache only
- Preview checks: no per-PR preview workflow; PR database validation is `CI` → `Postgres tests (integration + RLS + e2e)` using Docker Compose Postgres. Shared preview deploy is `Deploy Preview` / `pnpm deploy:preview` for all preview Workers. The workflow runs `pnpm deploy:preview:preflight`, `pnpm migrate:preview`, smoke actor seeding, `pnpm deploy:preview`, then `pnpm smoke:preview`. Target a Worker with standard Turbo filtering, for example `pnpm deploy:preview --filter @insecur/web`. Preview URLs are `https://api.preview.insecur.cloud`, `https://app.preview.insecur.cloud`, and `https://preview.insecur.cloud`; Runtime has no public route. API/Web/Site `/healthz` responses include `service`, `deploySha`, `runId`, and `deployedAt`, and preview smoke fails if any deploy SHA differs from the workflow SHA.
- Production deploy path: `Deploy Production` workflow only. It auto-runs after successful `CI` on `main`, can be manually dispatched as an operator fallback, requires a completed successful `CI` workflow run for the deployed commit, runs `pnpm migrate:production`, then deploys Cloudflare Workers `insecur-runtime`, `insecur-api`, `insecur-web`, and `insecur-site`. Runtime production deploy uploads code only and preserves the existing root-key Secrets Store and Hyperdrive bindings; API, Web, and Site production deploys preserve existing custom-domain routes. CI must not need Secrets Store write access or Workers Routes write access for routine deploys. `scripts/wrangler-deploy-config.mjs` materializes private IDs from the Preview/Production GitHub Environment before invoking Wrangler.
- Deploy GitHub Environment variables: Preview uses `PREVIEW_INSTANCE_ID`, `PREVIEW_HYPERDRIVE_ID`, `PREVIEW_RUNTIME_ROOT_KEY_STORE_ID`, `PREVIEW_RUNTIME_ROOT_KEY_SECRET_NAME`, and `PREVIEW_API_RATELIMIT_*_NAMESPACE_ID`; Production uses `PRODUCTION_INSTANCE_ID`, `PRODUCTION_HYPERDRIVE_ID`, `PRODUCTION_RUNTIME_ROOT_KEY_STORE_ID`, `PRODUCTION_RUNTIME_ROOT_KEY_SECRET_NAME`, and `PRODUCTION_API_RATELIMIT_*_NAMESPACE_ID`. Both environments use `WORKOS_CLIENT_ID` and require `SENTRY_AUTH_TOKEN` for release/source-map upload (human-created in Sentry, stored only as a GitHub Environment secret — see `docs/build-tooling.md` § Preview deploy). The workflows map those environment-scoped names into the package-level `INSECUR_*` variables consumed by `scripts/wrangler-deploy-config.mjs` and set `INSECUR_REQUIRE_SENTRY_SOURCEMAPS=true` during real deploys.
- Production approval required: standing prelaunch approval from Isaac covers CI/CD process changes and deploy runs needed to validate the release path until the project has real users or real production data

## Issue Tracker

- Provider: Linear (Linear MCP server)
- Provider location: team `INS` ("Insecur"); live ID intentionally omitted from public repo docs
- Metadata verified: 2026-05-28 via list_teams, list_issue_statuses, list_issue_labels, list_projects
- Label source of truth: live Linear team `INS` label metadata
- Label docs: `docs/agents/triage-labels.md` (mirror; covers readiness subset — see Unknowns)
- Routing label: `zaks-io/insecur` (parent `repo`); required on every repo issue, preserve on updates
- Triage scope: filter the `INS` queue by `zaks-io/insecur` before treating an issue as this repo's work
- Orphan policy: route only when project/team/parent/label is directly evidenced; else leave in `Triage` with `needs-info` or `ready-for-human`; never `ready-for-agent` until routing, body, and labels are correct. Encode status and blockers separately.
- Issue key examples: INS-16, INS-34, INS-35

### Statuses

- Triage
- Backlog
- Todo (ready state)
- In Progress
- Blocked
- In Review
- Changes Requested
- Ready to Merge (merge-ready state)
- Done
- Canceled
- Duplicate

### Labels

Readiness (parent `Readiness`):

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`
- remote worker: `remote-cursor` (no `Readiness` parent; this repo uses Cursor as the remote worker)

Review gate (no parent):

- `code-review-passed` — "Code review has passed and all feedback has been resolved". The merge-gate marker. Use this exact kebab-case slug; the display name is title-case ("Code review passed") and searching by the display string returns empty. Apply it to the issue when Agent Review is clean for the current PR head; the supporting evidence (head SHA + both reviewer verdicts) goes in an issue comment.

### Label Policies

- `ready-for-agent`: no further human refinement is needed before agent handoff; does not mean unblocked or startable.
- `remote-cursor`: approved to run in the remote Cursor environment; does not mean unblocked or startable.
- Startable work criteria: `Todo`, `ready-for-agent`, complete agent-ready body, no active blockers, no active claim, and no open PR.

Risk (no parent):

- `risk-normal`
- `risk-security-sensitive`
- `risk-schema`
- `risk-cross-cutting`

Type (parent `Type`):

- `Bug`
- `Feature`
- `Improvement`
- `Tech Debt`
- `Spike`
- `Hotfix`

### Projects

| Project                                        | Milestones                                                                                                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Customer Discovery & Design Partners`         | `Discovery Interviews Complete`; `Design Partners Recruited`; `Supported Repo Onboarding`; `Usage Evidence Review`; `Scope Gate Decision`                                                                         |
| `First Value Build`                            | `Tooling Baseline`; `Tenant and Security Foundation`; `Guided Onboarding Path`; `Secret Write Path`; `Runtime Injection Path`; `Copyable Proof Complete`                                                          |
| `Production Delivery Foundation`               | `Instance and Tenant Bootstrap`; `Human Auth and Authorization`; `Tenant-Bound Key Custody`; `Protected Environment Lifecycle`; `Storage Security Gate Ready`                                                     |
| `Machine Access and CI Trust`                  | `Machine Identity Model`; `GitHub Actions OIDC Federation`; `Environment Deploy Keys`; `Short-Lived Access Tokens`; `Machine Access Audit Coverage`                                                               |
| `Runtime Injection Delivery`                   | `Profile Model and Resolution`; `Profile-Backed CLI Run`; `Production Runtime Gate Enforcement`; `Deploy Runtime Injection`; `Metadata-Only Operation Output`                                                     |
| `Provider Sync: GitHub and Cloudflare`         | `App Connections and Boundaries`; `Sync Model and Exact Bindings`; `Explicit Provider Lookup`; `Inline Operation Store`; `GitHub Actions Sync`; `Cloudflare Worker Secret Sync`; `Sync Verify Retry Resume Audit` |
| `Approval UX and Delivery Policy`              | `Approval State Machine`; `Human Approval Surface`; `High-Assurance Challenges`; `Protected Delivery Configuration Approval`; `Delivery Risk Policy Presets`; `Preview Automation Opt-In`                         |
| `Audit, Runbooks, and Release Gates`           | `Tenant-Qualified Audit Hardening`; `Tamper-Evident Audit Export`; `Tested Restore Evidence`; `Security Runbooks`; `Release Gate Automation`; `Production Readiness Signoff`                                      |
| `Local Mode: Account-Less Development Custody` | `Spec and Docs Alignment`; `Local Key Custody and Store`; `Account-Less CLI Loop`; `Agent-Legible Metadata`; `Cloud Migrate Path`                                                                                 |

- Field model: Project = phase/program; project milestone = delivery gate; parent issue =
  workstream container mirroring `docs/specs/agent-workstreams.md`; child issue = one-PR work.
  Every non-container issue in an active project gets a project milestone.
- Workstream parents are containers: `kind-epic`, kept in `Backlog` with only `zaks-io/insecur`,
  no readiness/Type/risk label, no milestone. Never dispatched.
- Deferred scope is repo-tracked, not in Linear: `docs/phasing.md#deferred-scope-parking-lot`.
  Items listed there get no Linear scaffolding until promoted in the repo docs first.

- Priority policy: no agent priority automation; humans set priority
- Dependency policy: encode order with Linear `blockedBy` / `blocks`; not labels. Dependency-ready `kind-slice` tickets stay in `Todo` with `ready-for-agent`; blockers decide startability, not Linear Backlog placement. No repo deviation from the shared issue-tracker contract (`skills/ziw-setup/references/issue-tracker-contract.md`).
- Linear Backlog state: `Backlog`
- Linear Backlog policy: work agents must not work yet because it is uncommitted, intentionally parked, or not shaped correctly; never a dependency holding area; reviewed only on explicit user request
- Agent-ready issue body: contract in `skills/ziw-setup/references/issue-tracker-contract.md` (Outcome, Context docs, likely files/packages, In scope, Out of scope, Acceptance criteria, Required checks, Security invariants, Dependencies; no estimates configured)
- Status transition owner: Agent Orchestrator (`ziw-orchestrate`)
- Labels are signals, not authority: Linear status is the workflow source of truth; Agent Orchestrator owns transitions
- `save_issue` quirk: a partial-payload `save_issue` (e.g. state/delegate only) can return unchanged state or fail with "title is required". Send an explicit payload with `id` + the fields being changed (`state`, `labels`, etc.) rather than a minimal diff; that path is reliable. Do not retry the minimal payload 2-3 times before switching.

## Work Coordination

- Authoritative issue state: Linear team `INS`
- Authoritative PR state: GitHub `zaks-io/insecur`
- Authoritative check state: local `pnpm verify` plus the hosted GitHub `CI` workflow; duplicate-code warning annotations are non-blocking unless emitted by the strict zero-duplicate gate, while the zero-duplicate gate, actions-pin conformance gate, and package/deploy conformance gates are blocking in `pnpm verify` and in CI's `Verify` job (knip and actionlint are separate CI jobs, not part of `Verify`; workflow-only PRs run targeted workflow checks and skip product-code jobs)
- Authoritative deploy state: Cloudflare (Workers `insecur-api` public edge + `insecur-runtime` private decrypt-egress)
- Orchestrator mutation authority: Agent Orchestrator only
- Implement authority: Agent Implement (one issue per branch/PR)
- Review authority: Agent Review (clean context / disposable worktree)
- Merge method: squash only. `gh pr merge <n> --squash --delete-branch`. Merge commits are disabled on the repo, so `--merge` is rejected; do not retry with it.
- Merge authority: Agent Orchestrator may squash-merge a PR once both reviews (code-reviewer + security-auditor where applicable) PASS at the exact current head SHA and CI is green. This includes `risk-security-sensitive` PRs that are test-only or docs-only. Reserve human merge for: production crypto/credential/schema runtime behavior changes (not tests/docs about them), any review that is not clean, and PRs that are stale and need a rebase. The orchestrator still moves status to Ready to Merge; it no longer has to park there waiting on a human when the gate is satisfied.
- Worktree hygiene: review/agent worktrees (`agent-*`, `pr-*-review`) are ephemeral. Prune orphaned ones at tick start (`git worktree prune`, then force-remove leftover `agent-*`/`pr-*` paths) before any checkout-sensitive action; a stale worktree holding the `main` ref will break `gh pr merge`. Reviewers must remove their disposable worktree on completion, even on failure.
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
- Claude Code symlinks: `.claude/skills/ziw-*` -> `../.agents/skills/ziw-*`; root `skills/ziw-*` -> `../.agents/skills/ziw-*`
- Claude Code verification: `AGENTS.md -ef CLAUDE.md` confirmed (symlink); `.claude/skills/*` and `.agents/skills/*` md5 match confirmed
- Review model policy: implementation uses Composer 2.5; PR review uses strongest available tier (Opus-class / GPT-5.5 extra-high or current best). Do not move security/schema/cross-cutting PRs to Ready to Merge on a weak review without explicit human approval
- Agent Orchestrator: `ziw-orchestrate` (status-transition owner; replaced the former Agent Queue skill)
- Agent Review: `ziw-review`
- Agent Implement: `ziw-implement`

## Pull Requests

- PR title: Conventional Commits; reference issue (e.g. `feat(cli): ... (INS-NN)`)
- PR body: Summary, Changes, Risk, Test plan; metadata-only (no Sensitive Values)
- Required checks: `pnpm verify` locally, plus `pnpm test:coverage` when the PR touches covered packages (the coverage ratchet is NOT part of `verify`; it is CI's separate `Coverage` job and the most common first-pass CI failure); run strict `pnpm duplicates:check` when touching repeated logic or shared helpers
- Code review: `ziw-code-review` pre-PR (self) and on the PR (Agent Review, clean context)
- CodeRabbit config: root `.coderabbit.yaml`; bot `@coderabbitai`; `reviews.auto_review.enabled: false` (drafts off, incremental off)
- CodeRabbit wiring: active PRs can expose a CodeRabbit GitHub status context; Agent Orchestrator checks that context and current hosted review state against the PR head before merge
- CodeRabbit request policy: because auto-review is off, request a current-head hosted review with a top-level PR comment (`@coderabbitai review`, or `@coderabbitai full review` when no complete review covers the head) after local review is clean when `ziw-code-review` recommends escalation, the diff is HIGH-risk (auth, secrets, schema/migration, crypto, credentials, production-runtime), or a human asks; wait when a hosted review is already pending or complete for the current head; treat missing auth, rate limits, or credits as a recorded skip unless explicitly required
- CodeRabbit is additive: it does not replace Agent Review, required CI, or human/security merge gates for `risk-security-sensitive`, `risk-schema`, credential, crypto, or production-runtime behavior changes
- Issue update: Agent Orchestrator moves Linear status; In Review on PR open, Changes Requested on feedback, Ready to Merge when clean
- Merge authority: see Work Coordination — Agent Orchestrator squash-merges on dual-reviewer PASS at the pinned head SHA with CI green; human merge reserved for production crypto/credential/schema runtime changes, unclean reviews, and stale PRs needing rebase

## Environments

- Local: self-contained
- Local commands: `pnpm dev:workers` (runs `insecur-api` + `insecur-runtime`; API at http://localhost:8787/healthz); `pnpm dev:db:reset` (Postgres 17 Docker Compose, local-only role guard)
- Local services: local Postgres 17 (iteration aid only; ADR-0060 pins 17 until Neon supports 18)
- Development: may use cloud backing services while app runs locally
- Development backing services: Neon Postgres (real RLS tests need `DATABASE_URL_RUNTIME`, start at FV-04); Cloudflare Workers
- Preview: `Deploy Preview` workflow or local `pnpm deploy:preview`
- Preview purpose: n/a until FV-02
- Production: standing prelaunch approval applies until the project has real users or real production data
- Production deploy/process standing approval: agents may change CI/CD deploy process and run deploy commands needed to validate the release path. Keep Sensitive Values out of logs and preserve deploy capability isolation.
- Hosted checks allowed without approval: read-only Linear MCP, read-only GitHub, local `pnpm verify`, Worker dry-run via `pnpm build`
- Hosted checks requiring approval: secret/key material changes, or any production Cloudflare/Neon write unrelated to validating the prelaunch release path

## Security Baseline

Never store, print, log, fixture, screenshot, or summarize Sensitive Values anywhere, including
Linear prose, PR bodies, comments, tests, and screenshots; issue bodies, PR descriptions, and logs
stay metadata-only. Do not add reveal paths, plaintext exports, local secret files, debug decrypt
paths, or unsafe development shortcuts.

## Unknowns

- [ ] Hosted `CI` docs-only PR behavior should be rechecked after the next docs-only PR: required code-heavy jobs should report green no-ops, and gitleaks should still run. PRs must not provision Neon branches or per-PR Workers.
