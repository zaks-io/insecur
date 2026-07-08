# Cursor Cloud Environment

This repo has a committed Cursor Cloud Agent environment so remote agents use the same Node, pnpm,
Postgres 17, and security-tool baseline as local development and CI.

## Source Of Truth

- `.cursor/environment.json` is the repo-level Cursor Cloud Agent config.
- `.cursor/Dockerfile` defines the machine baseline.
- `.cursor/start-postgres.sh` starts and provisions the native Postgres 17 service used by Cursor
  Cloud Agents.
- `.cursor/install-agent-tools.sh` installs pinned external CLIs that are not normal npm
  dependencies.
- `.nvmrc`, `.node-version`, `.npmrc`, `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` define the Node and pnpm contract.
- `compose.yaml` and `infra/postgres/*` define the local-only Postgres scaffold for laptops and CI.
- `docs/agents/repo-navigation.md` is the fast repo map remote agents should read before broad
  exploration.

Cursor's repo-level environment config should be treated as reviewable infrastructure. Do not replace it with only personal or team dashboard settings.

## Cursor References

- Cursor environment schema: https://cursor.com/schemas/environment.schema.json
- Cursor Cloud environment setup: https://cursor.com/docs/cloud-agent/setup
- Cursor startup commands: https://cursor.com/docs/cloud-agent/setup#startup-commands

## Maintenance Rules

- Keep Node on major 24 until `docs/build-tooling.md` changes.
- Keep pnpm on `10.19.0` until the package manager baseline is intentionally updated.
- Keep local Postgres on major 17 until ADR-0060 changes. Postgres 18 remains preview on Neon, so
  remote agents should not build against PG18-only behavior.
- Keep Cursor Cloud instructions aligned with `AGENTS.md`, `.cursor/rules/insecur.mdc`, and
  `docs/agents/repo-navigation.md`; do not create remote-only navigation rules.
- Keep dependency installation in `.cursor/environment.json` `install`; it must be idempotent and safe to rerun after checkout.
- Keep `.cursor/start-postgres.sh` in `.cursor/environment.json` `start` so RLS and local smoke work
  without Docker daemon startup. Use `pnpm smoke:local` for the normal Cursor Agent path; it resets
  the configured native Postgres database before running the DB-backed gate.
- Do not install Docker in the Cursor image unless a concrete Cursor-side container workflow needs
  it. `pnpm smoke:local:docker` remains available on local machines and CI.
- Do not add long-running `terminals` unless a task specifically needs an always-on remote Worker
  session.
- Keep the Cursor image's CLI surface aligned with `AGENTS.md`: `rg`, `jq`, `fd`, `nmap`,
  `semgrep`, `trivy`, `gitleaks`, `grype`, `syft`, `checkov`, `nikto`, and `sqlmap` should be on
  `PATH`.
- Worker deploys are capability-isolated, never a monolith. The decided topology is `apps/api`
  (public edge, no keyring), `apps/runtime` (sole `INSTANCE_ROOT_KEY_V1` holder, decrypt-egress
  behind a `WorkerEntrypoint` RPC seam, no public routes), and `apps/web` (BFF), per
  ADR-0051/0064/0071 and tracked by INS-194. Remote agents must never compose multiple capabilities
  (public routes + decrypt authority) into one deploy, and must never add the root-key binding to a
  deploy that serves public routes. A new route belongs to a specific deploy by capability; the CI
  deploy-topology conformance gate (INS-199) fails any deploy that holds both a public route and the
  root key. See `docs/project-status.md` (Worker topology) and the decomposition epic INS-194.
- Public/API-facing and contract packages must not grow a production dependency path to
  `@insecur/crypto`; `pnpm conformance:packages` is included in `pnpm verify` and in CI's `Verify`
  job and enforces that package-boundary split.
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
pnpm smoke:local
pnpm verify
pnpm test:coverage
pnpm typecheck
pnpm build
docker build -f .cursor/Dockerfile .cursor -t insecur-cursor-env-test
docker run --rm -v "$PWD:/workspaces/insecur" -w /workspaces/insecur insecur-cursor-env-test sh -lc 'node --version && pnpm --version && psql --version && rg --version && jq --version && fd --version && nmap --version && gitleaks version && syft version && grype version && trivy --version && semgrep --version && checkov --version && nikto -Version && sqlmap --version'
docker run --rm -v "$PWD:/workspaces/insecur" -w /workspaces/insecur insecur-cursor-env-test sh -lc 'pnpm dev:db:env && sudo /usr/local/bin/insecur-start-postgres'
```

## Pre-PR gate for remote agents

`pnpm verify:pr` runs `verify:policy` plus Turbo's affected package check, but it does NOT run the
coverage ratchet — that is the separate
`pnpm test:coverage` command (thresholds in `scripts/merge-coverage.mjs`). Cursor Cloud agents do not
run git push hooks, so the pre-push `test:coverage` safety net does not fire here. Before opening a
PR that touches covered packages, run `pnpm test:coverage` explicitly in addition to `pnpm verify:pr`.
Skipping it is the most common first-pass CI failure in this repo.
