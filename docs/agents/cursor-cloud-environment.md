# Cursor Cloud Environment

This repo has a committed Cursor Cloud Agent environment so remote agents use the same Node and pnpm baseline as local development and future CI.

## Source Of Truth

- `.cursor/environment.json` is the repo-level Cursor Cloud Agent config.
- `.cursor/Dockerfile` defines the machine baseline.
- `.nvmrc`, `.node-version`, `.npmrc`, `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` define the Node and pnpm contract.
- `compose.yaml` and `infra/postgres/*` define the local-only Postgres scaffold for agent
  iteration.
- `docs/agents/repo-navigation.md` is the fast repo map remote agents should read before broad
  exploration.

Cursor's repo-level environment config should be treated as reviewable infrastructure. Do not replace it with only personal or team dashboard settings.

## Cursor References

- Cursor environment schema: https://cursor.com/schemas/environment.schema.json
- Cursor Cloud environment release notes: https://cursor.com/changelog/05-13-26
- Cursor environment announcement: https://cursor.com/blog/cloud-agent-development-environments

## Maintenance Rules

- Keep Node on major 24 until `docs/build-tooling.md` changes.
- Keep pnpm on `10.19.0` until the package manager baseline is intentionally updated.
- Keep local Postgres on major 17 until ADR-0060 changes. Postgres 18 remains preview on Neon, so
  remote agents should not build against PG18-only behavior.
- Keep Cursor Cloud instructions aligned with `AGENTS.md`, `.cursor/rules/insecur.mdc`, and
  `docs/agents/repo-navigation.md`; do not create remote-only navigation rules.
- Keep dependency installation in `.cursor/environment.json` `install`; it must be idempotent and safe to rerun after checkout.
- Keep Docker daemon startup in `.cursor/environment.json` `start` so `pnpm dev:db:*` can run in
  Cursor Cloud Agent environments.
- Do not add long-running `terminals` unless a task specifically needs an always-on remote Worker
  session.
- Do not `COPY` the repository into `.cursor/Dockerfile`; Cursor manages checkout and branch state.
- Do not add secrets to `.cursor/environment.json` or `.cursor/Dockerfile`.
- Any package added to `onlyBuiltDependencies` is a supply-chain decision and should be reviewed as such.

## Validation

Use these checks after environment changes:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev:check
pnpm dev:db:reset
pnpm verify
pnpm typecheck
pnpm build
docker build -f .cursor/Dockerfile .cursor -t insecur-cursor-env-test
docker run --rm insecur-cursor-env-test sh -lc 'node --version && pnpm --version && docker --version && docker compose version'
```
