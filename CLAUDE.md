# insecur

insecur is no-reveal secrets custody for teams shipping with agents and CI. See `docs/vision.md` for the north star: what this is, what it is trying to accomplish, and the overall direction of the repo.

## Agent skills

This repo has repo-local skills in `skills/*/SKILL.md`. If a task names one of those skills or
matches its description, read the matching skill before acting. See `docs/agents/skill-usage.md`.

Runtime-specific files are adapters only. Shared workflow truth lives in `docs/agents/*` and
`skills/*/SKILL.md`; keep Codex, Claude, and Cursor behavior aligned through those files.

### Workflow

The end-to-end repo workflow is documented in `docs/agents/workflow.md`: how to choose a skill,
move work through Linear, implement one issue, review PRs, and coordinate agents.

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

### Cursor Cloud environment

Remote Cursor agent setup and maintenance notes live in `docs/agents/cursor-cloud-environment.md`.

### Environment adapters

Codex, Claude, and Cursor runtime differences are documented in
`docs/agents/environment-adapters.md`.

## Cursor Cloud specific instructions

The `.cursor/environment.json` and `.cursor/Dockerfile` are the environment source of truth. The Dockerfile pins `node:24-bookworm` and corepack-activated `pnpm@10.19.0`. If the Dockerfile image is not yet built for your session, install Node 24 via nvm (`nvm install 24 && nvm use 24`) before running pnpm.

### Quick reference

- **Install deps:** `pnpm install --frozen-lockfile`
- **Verify:** `pnpm verify` (format check, lint, typecheck, and unit-test task fan-out)
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
- Local Postgres is an iteration aid only. It is pinned to Postgres 17 until ADR-0060 changes because Postgres 18 is still preview on Neon.
- `pnpm test:rls` is wired as an uncached tenant-store placeholder. Real Postgres RLS tests start with FV-04 and require `DATABASE_URL_RUNTIME`.
- Lefthook, GitHub Actions validation, and secret/dependency scanning are not wired yet; FV-02 owns that follow-up.
- Package `src/index.ts` files export `export {};` — this is a deliberate empty skeleton per ADR-0018.
- `pnpm-workspace.yaml` has `strictDepBuilds: true` and `onlyBuiltDependencies` allowlist. Adding a dependency that runs lifecycle scripts requires an explicit allowlist addition.
