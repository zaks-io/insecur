# insecur

insecur is no-reveal secrets custody for teams shipping with agents and CI. See `docs/vision.md` for the north star: what this is, what it is trying to accomplish, and the overall direction of the repo.

## Agent skills

### Issue tracker

Issues are tracked in Linear project INS- using the Linear MCP server. See `docs/agents/issue-tracker.md`.

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

## Cursor Cloud specific instructions

The `.cursor/environment.json` and `.cursor/Dockerfile` are the environment source of truth. The Dockerfile pins `node:24-bookworm` and corepack-activated `pnpm@10.19.0`. If the Dockerfile image is not yet built for your session, install Node 24 via nvm (`nvm install 24 && nvm use 24`) before running pnpm.

### Quick reference

- **Install deps:** `pnpm install --frozen-lockfile`
- **Typecheck:** `pnpm typecheck` (runs across all 10 workspace packages)
- **Build:** `pnpm build` (worker build fails until `wrangler.jsonc` exists — this is expected and documented in `docs/agents/cursor-cloud-environment.md`)
- **Build without worker:** `pnpm build --filter='!@insecur/worker'`
- **Hello-world proof:** `INSECUR_PROOF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node examples/first-value-proof/verify.mjs`

### Known caveats

- `engine-strict=true` in `.npmrc` means `pnpm install` will hard-fail if Node is not on major 24. Always verify `node --version` first.
- `@insecur/worker` build requires a `wrangler.jsonc` that does not exist yet. Filter it out for now: `pnpm build --filter='!@insecur/worker'`.
- No ESLint config, Prettier config, lefthook config, or test files exist yet. `pnpm lint`, `pnpm test`, and `pnpm format:check` are not wired up. See `docs/build-tooling.md` for the planned configuration.
- All package `src/index.ts` files export `export {};` — this is a deliberate empty skeleton per ADR-0018.
- `pnpm-workspace.yaml` has `strictDepBuilds: true` and `onlyBuiltDependencies` allowlist. Adding a dependency that runs lifecycle scripts requires an explicit allowlist addition.
