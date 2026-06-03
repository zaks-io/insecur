# insecur

insecur is no-reveal secrets custody for teams shipping with agents and CI. See `docs/vision.md` for the north star: what this is, what it is trying to accomplish, and the overall direction of the repo.

This project is not live yet and has no users. We are still building out, configuring, and verifying the application before going live. There is no production data worth protecting.

During this build-out period:

- Destructive operations (dropping databases, wiping state, resetting environments, recreating schemas) are fine and do not need extra confirmation.
- Do not write data-preservation migration scripts, backwards-compatible schema changes, or multi-step rollout plans to protect data that does not exist. Just change the schema and reset. Prefer recreate-from-scratch over migrate.
- Secret rotation, real migrations, and staged rollout plans come later, once we are live.

This stays true until the project actually ships.

## Agent skills

This repo has repo-local skills in `skills/*/SKILL.md`. If a task names one of those skills or
matches its description, read the matching skill before acting. See `docs/agents/skill-usage.md`.

Runtime-specific files are adapters only. Shared workflow truth lives in `docs/agents/*` and
`skills/*/SKILL.md`; keep Codex, Claude, and Cursor behavior aligned through those files.

### Workflow

The end-to-end repo workflow is documented in `docs/agents/workflow.md`: how to choose a skill,
move work through Linear, implement one issue, review PRs, and coordinate agents. Read
`docs/agents/workflow/config.md` first for the workflow lookup table (commands, Linear IDs, labels,
runtimes, gates) before using any `workflow-*` skill.

### Fast repo navigation

Use `docs/agents/repo-navigation.md` when you need to quickly find the right status doc, spec,
context map, package owner, Linear workflow doc, or repo-local skill. Start with
`docs/project-status.md`, then `CONTEXT-MAP.md`, then the local `CONTEXT.md` for the app or package
you will touch.

### Issue tracker

Issues are tracked in Linear team `INS` using the Linear MCP server. See
`docs/agents/issue-tracker.md`.

### Autonomous agent loop

Agents working from Linear must follow `docs/agents/autonomous-loop.md` for issue readiness,
claiming, blockers, PR handoff, and Linear setup conventions.

### Triage labels

This repo uses the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context domain doc layout rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.

### Project status

Current implementation status and next steps are tracked in `docs/project-status.md`.

### Testing

The three-layer test strategy (unit / integration+RLS / preview smoke) and the agent
one-command loop (`pnpm dev:db:reset && pnpm test:e2e`) are documented in
`docs/agents/testing.md`; the decision record is `docs/adr/0065-test-layers-and-preview-smoke.md`.

### Cursor Cloud environment

Remote Cursor agent setup and maintenance notes live in `docs/agents/cursor-cloud-environment.md`.

### Environment adapters

Codex, Claude, and Cursor runtime differences are documented in
`docs/agents/environment-adapters.md`.

## Cursor Cloud specific instructions

The `.cursor/environment.json` and `.cursor/Dockerfile` are the environment source of truth. The Dockerfile pins `node:24-bookworm` and corepack-activated `pnpm@10.19.0`. If the Dockerfile image is not yet built for your session, install Node 24 via nvm (`nvm install 24 && nvm use 24`) before running pnpm.

### Quick reference

- **Install deps:** `pnpm install --frozen-lockfile`
- **Verify:** `pnpm verify` (duplicate warnings + blocking ratchet, knip, format check, lint, typecheck, and unit-test task fan-out)
- **Duplicate scan:** `pnpm duplicates:check` (strict jscpd zero gate). CI/pre-push enforce `pnpm duplicates:ci` (ratchet, threshold 0.5%).
- **Unused code/deps:** `pnpm knip` (blocking in CI, pre-push, and verify)
- **Workflow lint:** `pnpm lint:actions` (actionlint; blocking in CI, optional-local in pre-push/verify)
- **Typecheck:** `pnpm typecheck` (runs across all 10 workspace packages)
- **Dev check:** `pnpm dev:check` (Node, pnpm, Wrangler, and scaffold file checks)
- **Local Postgres:** `pnpm dev:db:reset` (Postgres 17 Docker Compose, local-only role guard)
- **Build:** `pnpm build` (includes the Worker dry-run deploy through `apps/worker/wrangler.jsonc`)
- **Worker dev:** `pnpm dev:worker` then check `http://localhost:8787/healthz`
- **Hello-world proof:** `INSECUR_PROOF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node examples/first-value-proof/verify.mjs`

### Known caveats

- `engine-strict=true` in `.npmrc` means `pnpm install` will hard-fail if Node is not on major 24. Always verify `node --version` first.
- `@insecur/worker` has a scaffold-only `/healthz` route. It is not product behavior and does not prove storage, auth, encryption, audit, or Runtime Injection.
- ESLint, Prettier, Vitest, and `pnpm verify` are wired up. Package tests currently use Vitest's no-test pass-through until product slices add real tests.
- jscpd duplicate-code detection: `pnpm duplicates:check` is the strict local zero gate; the `CI` workflow and pre-push run `pnpm duplicates:warn` (annotations) then `pnpm duplicates:ci` (blocking ratchet at threshold 0.5%, just above the current ~0.42% backlog). knip (`pnpm knip`) is also blocking in CI, pre-push, and verify; its export/type dead-code rules are deferred off in `knip.json` until package indexes wire up (ADR-0018).
- Local Postgres is an iteration aid only. It is pinned to Postgres 17 until ADR-0060 changes because Postgres 18 is still preview on Neon.
- `pnpm test:rls` runs the real forced-RLS tenant suite (requires `DATABASE_URL_RUNTIME`); it now executes in CI's `postgres-integration` job alongside `pnpm test:e2e` (the First Value loop through the real Worker routes). See `docs/agents/testing.md`.
- Lefthook pre-commit runs staged Prettier/ESLint, optional local gitleaks (skipped when `gitleaks` is not on PATH), and `turbo typecheck`; pre-push runs `pnpm verify` + `pnpm test:coverage`, mirroring CI's `Verify` and `Coverage` jobs so lint/type/test/format/dup/knip/actionlint/coverage churn is caught before pushing. The `CI` (`ci.yml`) and `security-daily` workflows add the security scanners (gitleaks, semgrep, syft+grype) on Blacksmith runners; those stay CI-only and out of the push hot path (`docs/build-tooling.md`).
- Package `src/index.ts` files export `export {};` — this is a deliberate empty skeleton per ADR-0018.
- `pnpm-workspace.yaml` has `strictDepBuilds: true` and `onlyBuiltDependencies` allowlist. Adding a dependency that runs lifecycle scripts requires an explicit allowlist addition.
