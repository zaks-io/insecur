# Build Tooling And Quality Gates

This is the implementation spec for insecur's monorepo build tooling and quality gates. It is meant to be precise enough that an implementing agent can build it without further judgment calls. The reasoning behind each decision lives in the ADRs; this document records the exact configuration.

- ADR-0053: remote build cache trust model (CI-only-write, signed)
- ADR-0054: tenant-isolation tests run against real Postgres as the `NOBYPASSRLS` role
- ADR-0055: ESLint and Prettier type-aware toolchain
- ADR-0056: supply-chain hardening posture (pnpm lifecycle blocking, release quarantine)
- ADR-0060: Postgres 17 development baseline while Postgres 18 is preview on Neon
- ADR-0065: three test layers — unit, integration+RLS on Docker Compose Postgres, gated Neon
  preview smoke
- ADR-0029: environments and CD trust model (staging auto, production gated, machine-identity deploy)
- ADR-0008: security gates and runbooks (the gate contract these tools satisfy)
- ADR-0036 / ADR-0037: Neon RLS and the Tenant-Scoped Bound Store these tests exercise
- ADR-0004: machine identities and CI auth

`CONTEXT.md` is the domain glossary and must not carry any of this tooling. Build configuration lives in the config files described here and in this spec.

## Version Policy

The load-bearing decision is the major version of each tool, not the patch. Pin the latest patch within each required major at implementation time and resolve shared versions through the pnpm catalog. The versions below are the known-good floor as of 2026-05-25.

| Tool                   | Required major  | Known-good floor |
| ---------------------- | --------------- | ---------------- |
| Node.js                | 24              | 24 (active LTS)  |
| pnpm                   | 10              | 10.19.0          |
| Turborepo              | 2               | 2.8.0            |
| TypeScript             | 5               | 5.x latest       |
| ESLint                 | 9 (flat config) | 9.x latest       |
| typescript-eslint      | 8               | 8.x latest       |
| eslint-config-prettier | 10              | 10.x latest      |
| Prettier               | 3               | 3.5.3            |
| Vitest                 | 3               | 3.x latest       |
| jscpd                  | 4               | 4.2.4            |
| Wrangler               | 4               | 4.x latest       |
| Local Postgres         | 17              | 17.x latest      |
| lefthook               | 2               | 2.1.8            |
| postgres (postgres.js) | 3               | 3.x latest       |

pnpm 10 is mandatory, not a preference: `minimumReleaseAge` and `strictDepBuilds` (ADR-0056) are pnpm 10 features and the repo is currently pinned at `pnpm@9.0.0`. The 9 to 10 upgrade is a prerequisite.

## Runtime And Package Manager

Create these files at the repo root.

`.nvmrc`:

```
24
```

`.node-version`:

```
24
```

`.npmrc`:

```
engine-strict=true
```

`package.json` (root) gains:

```jsonc
{
  "packageManager": "pnpm@10.19.0",
  "engines": { "node": ">=24 <25" },
}
```

`engine-strict` plus the `>=24 <25` range means an install on the wrong Node major fails loudly rather than producing a subtly different lockfile.

## pnpm-workspace.yaml

All pnpm settings live here in pnpm 10, not in `.npmrc`. Full file:

```yaml
packages:
  - "apps/*"
  - "packages/*"

# Supply-chain hardening (ADR-0056)
# Lifecycle scripts are blocked unless the package is listed here.
onlyBuiltDependencies:
  - esbuild
  - workerd
# Install fails if a dependency wants to run a build/postinstall script
# that is not decided above.
strictDepBuilds: true
# Quarantine: a version must be public for 3 days (4320 minutes) before install.
minimumReleaseAge: 4320
# Strict, content-addressed layout; no hoisting surprises.
nodeLinker: isolated

# Shared dependency versions resolved through the catalog.
catalog:
  typescript: ^5.7.0
  turbo: ^2.8.0
  eslint: ^9.18.0
  typescript-eslint: ^8.20.0
  eslint-config-prettier: ^10.0.0
  prettier: ^3.5.3
  vitest: ^3.0.0
  "@vitest/coverage-v8": ^3.0.0
  jscpd: ^4.2.4
  lefthook: ^2.1.8
  jiti: ^2.4.0
  globals: ^16.0.0
  postgres: ^3.4.0
```

The `onlyBuiltDependencies` list starts minimal (`esbuild`, `workerd`) and grows only by reviewed PR. Adding a dependency whose install needs a build step is a deliberate, visible edit, not a silent allow.

## turbo.json

Remote cache trust model is ADR-0053. Full file:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "envMode": "strict",
  "globalDependencies": [
    ".env",
    ".env.*",
    ".node-version",
    ".nvmrc",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "eslint.config.ts",
    ".prettierrc.json",
    ".prettierignore",
  ],
  "globalEnv": ["CI", "NODE_ENV"],
  "futureFlags": { "longerSignatureKey": true },
  "remoteCache": { "signature": true },
  "tasks": {
    "topo": { "dependsOn": ["^topo"] },
    "build": {
      "dependsOn": ["^build"],
      "env": ["CLOUDFLARE_ENV"],
      "outputs": ["dist/**"],
    },
    "dev": { "cache": false, "persistent": true },
    "typecheck": { "dependsOn": ["topo", "^build"], "outputs": [] },
    "lint": { "dependsOn": ["topo", "^build"], "outputs": [] },
    "test": { "dependsOn": ["topo", "^build"], "outputs": [] },
    "test:rls": {
      "dependsOn": ["topo", "^build"],
      "cache": false,
      "env": ["DATABASE_URL_RUNTIME"],
    },
    "typegen": { "cache": false, "outputs": [] },
  },
}
```

Notes that an implementing agent must not change without understanding them:

- The `topo` task is a transit node. `typecheck`, `lint`, `test`, and `test:rls` depend on `topo`, which depends on `^topo`. This forces a cache key to bust when an upstream package's source changes, so a stale cached `typecheck` pass cannot survive an upstream type error. This is the documented just-in-time-package correctness pattern and is load-bearing for "no type errors are ever committed."
- `test:rls` has `cache: false` because it runs against live database state — Docker Compose Postgres locally and in CI's `postgres-integration` job (ADR-0065) — and declares `DATABASE_URL_RUNTIME` so the runtime credential participates in nothing cacheable.
- `globalDependencies` includes the root `eslint.config.ts`, Prettier config, and `.prettierignore` so a rule change busts every cached `lint`.
- `envMode: strict` means a task only sees environment variables it declares. Declare new inputs in the task `env` array, do not relax the mode.
- `lint`, `typecheck`, `test`, and `test:rls` depend on `^build` so workspace packages that export `dist/**` types (for example `@insecur/domain`) are built before downstream checks run. `pnpm verify` must pass from a clean checkout without a separate prebuild.

### Cache write scope (ADR-0053)

The remote cache trust boundary is enforced by the `--cache` flag, not by `turbo.json`:

- Developer machines and agents: `turbo run <task> --cache=local:rw,remote:r`. They read remote, write only local.
- CI: `turbo run <task> --cache=local:rw,remote:rw`. CI is the only writer of shared artifacts.

Set the developer default by putting `--cache=local:rw,remote:r` into the root scripts (below). CI overrides with `remote:rw` explicitly. The signing key is `TURBO_REMOTE_CACHE_SIGNATURE_KEY`; the cache backend starts on the Vercel-managed endpoint via `TURBO_TOKEN` and `TURBO_TEAM`.

## Root package.json Scripts

The root `package.json` is the authoritative script list; this is the load-bearing subset (cache
flags, gates, and test layers). The dev conveniences (`dev`, `dev:worker`, `deploy:worker`, `cli`,
`migrate:local`, the remaining `dev:db:*` commands, `dev:check`/`doctor`, `clean`) live there too
and are not repeated here.

```jsonc
{
  "scripts": {
    "build": "turbo run build --cache=local:rw,remote:r",
    "typecheck": "turbo run typecheck --cache=local:rw,remote:r",
    "lint": "turbo run lint --cache=local:rw,remote:r",
    "lint:actions": "node scripts/ci/actionlint-local.mjs",
    "duplicates:check": "jscpd --config .jscpd.json apps packages scripts",
    "duplicates:ci": "jscpd --config .jscpd.json --threshold 0.5 apps packages scripts",
    "duplicates:warn": "node scripts/ci/jscpd-warn.mjs",
    "knip": "knip",
    "test": "turbo run test --cache=local:rw,remote:r",
    "test:coverage": "turbo run build --cache=local:rw,remote:r && vitest run --coverage --config vitest.coverage.config.ts",
    "test:rls": "turbo run test:rls",
    "test:e2e": "turbo run test:e2e",
    "test:canary": "turbo run test:canary",
    "dev:db:reset": "node scripts/dev-db.mjs reset",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "verify": "pnpm duplicates:warn && pnpm duplicates:ci && pnpm knip && pnpm lint:actions && pnpm format:check && turbo run lint typecheck test --cache=local:rw,remote:r",
    "prepare": "node scripts/lefthook-install.mjs",
  },
}
```

`verify` is the single local command that mirrors the `CI` workflow's deterministic floor minus the
security scanners and the DB-backed `postgres-integration` job: duplicate-warning annotations, the
blocking duplicate ratchet, knip, actionlint (optional-local), the Prettier check, then the Turbo
`lint typecheck test` fan-out. A green `verify` should predict a green `CI`. `prepare` installs the
lefthook hooks via `scripts/lefthook-install.mjs` on every install.

## Duplicate Code Detection

jscpd is the repo-wide copy/paste detector. It scans product TypeScript and JavaScript under
`apps`, `packages`, and `scripts` using `.jscpd.json`, excluding tests and generated code. Three
commands wrap it, each with a different threshold:

```sh
pnpm duplicates:check   # threshold 0  — strict local zero gate
pnpm duplicates:ci      # threshold 0.5 — ratchet floor, blocking in CI and pre-push
pnpm duplicates:warn    # annotations only, never fails
```

`duplicates:check` exits non-zero on any clone; it is the aspirational zero target for local use.
`duplicates:ci` is the **blocking ratchet**: set just above the current duplication (currently
~0.42%) so CI and pre-push are green today but any new duplication trips them. Lower the `--threshold`
in the `duplicates:ci` script as the backlog burns down; never raise it.

`duplicates:warn` writes `.jscpd-report/ci/jscpd-report.json` and emits GitHub warning annotations for
each clone without failing, so reviewers see every clone even those under the ratchet. The `CI`
workflow and `pnpm verify` run `duplicates:warn` (annotate) followed by `duplicates:ci` (enforce).
Once the backlog reaches zero, drop the ratchet to `0` and `duplicates:ci` becomes `duplicates:check`.

## Unused Code and Dependencies (knip)

[knip](https://knip.dev) flags unused files, unused and unlisted dependencies, and dead exports
across the pnpm workspace using `knip.json`. The blocking command, run in CI (the `Knip` job),
pre-push, and `pnpm verify`, is:

```sh
pnpm knip
```

Export- and type-level dead-code rules (`exports`, `types`, `nsExports`, `nsTypes`, `enumMembers`,
`duplicates`) are deferred off in `knip.json` because the package `src/index.ts` files are deliberate
empty skeletons (ADR-0018) and nothing re-exports through them yet, so every internal symbol would
read as unused. The active rules catch dependency drift and orphaned files now. As product code wires
the package indexes up, turn those rules back on one at a time — that is the knip ratchet.

## Workflow Lint (actionlint)

[actionlint](https://github.com/rhysd/actionlint) lints every workflow under `.github/workflows`
and shellchecks each `run:` block. It is blocking in CI (the `Actionlint` job) and runs in pre-push
and `pnpm verify`.

CI installs a pinned actionlint via `scripts/ci/install-actionlint.sh` and runs the binary directly,
so the CI job is the authoritative gate. Locally, `pnpm lint:actions` (via
`scripts/ci/actionlint-local.mjs`) runs actionlint if it is on PATH and skips with a notice
otherwise, mirroring the optional-local gitleaks pattern; pre-push only triggers it when a workflow
file or `.github/actionlint.yaml` is in the push. Blacksmith's custom runner label is unknown to
actionlint, so it is declared in `.github/actionlint.yaml` (ADR-0061) to suppress the false positive.

## ESLint (eslint.config.ts)

Flat config, type-aware everywhere, one ruleset (ADR-0055). The `.ts` config requires `jiti`, which is in the catalog. `eslint-config-prettier` is applied last so no lint rule fights the formatter.

```ts
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.wrangler/**", "**/coverage/**", "**/*.gen.ts"],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Node-hosted code: CLI and repo scripts.
  {
    files: ["packages/cli/**/*.ts", "scripts/**/*.{ts,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Plain JS gets no type-aware rules (no typed program).
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Complexity and size budgets (ADR-0055). Core rules, so they apply to JS
  // and TS alike; caller-agnostic, enforced in CI at --max-warnings=0.
  {
    rules: {
      complexity: ["error", 8],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-statements": ["error", 15],
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
  // Tests run long by nature (describe blocks, fixtures); relax the two length
  // caps there. complexity, depth, and params still apply to test code.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
    },
  },
  // Must be last: turn off rules that conflict with Prettier.
  eslintConfigPrettier,
);
```

`projectService: true` relies on TypeScript project references across the workspace, so there are no per-package ESLint tsconfigs. The Cloudflare Worker package gets its ambient types from `@cloudflare/workers-types` through its own `tsconfig`, not through ESLint globals.

Each package defines `"lint": "eslint ."` so the Turbo `lint` task fans out per package.

### Complexity And Size Budgets

These caps keep generated code small and decomposed. Agents write the bulk of this codebase and will, unprompted, emit long functions and large files; the budgets fail the build before that lands instead of relying on a reviewer to catch it. They are core ESLint rules (not type-aware), so they apply to JS and TS alike, and they run in the same `CI` gate at `--max-warnings=0`, so the limit blocks every author identically.

| Rule                     | Value | Caps                                       |
| ------------------------ | ----- | ------------------------------------------ |
| `complexity`             | 8     | cyclomatic branches per function           |
| `max-depth`              | 3     | nested block depth                         |
| `max-params`             | 4     | parameters per function                    |
| `max-nested-callbacks`   | 3     | callback nesting                           |
| `max-statements`         | 15    | statements per function                    |
| `max-lines-per-function` | 50    | lines per function (blank/comment-skipped) |
| `max-lines`              | 250   | lines per file (blank/comment-skipped)     |

Per-character line width is absent on purpose: Prettier's `printWidth: 100` already governs column width, and `max-lines` governs file length.

Test files (`**/*.{test,spec}.{ts,tsx}`) turn off `max-lines` and `max-lines-per-function` only; a long `describe` block or fixture is not the smell these budgets target, but `complexity`, `max-depth`, and `max-params` still apply. If `describe`/`it` nesting later trips `max-statements` or `max-nested-callbacks`, add those to the test override rather than weakening the global value.

## Prettier

Sole formatter for all file types including Markdown (ADR-0055).

`.prettierrc.json`:

```json
{
  "printWidth": 100,
  "singleQuote": false,
  "trailingComma": "all"
}
```

`.prettierignore`:

```
**/dist/**
**/.wrangler/**
**/coverage/**
pnpm-lock.yaml
**/*.gen.ts
```

## lefthook.yml

Pre-commit catches per-file issues on staged files (format, lint, typecheck, staged secret scan). Pre-push runs the full deterministic CI gate so the high-churn failures — lint, types, tests, format, duplicates, knip, actionlint, coverage thresholds — are caught locally instead of after a CI round-trip: `pnpm verify` is the same floor CI's `Verify` job runs, and `pnpm test:coverage` is CI's `Coverage` job. Security scanners (semgrep, grype, gitleaks history) stay CI-only because they are low-frequency and do not belong in the push hot path. `--no-verify` is an accepted human escape hatch because CI branch protection is the real enforcement boundary, not the hook.

The `format-and-lint` group runs Prettier then ESLint sequentially on the same TypeScript files so `eslint --fix` operates on Prettier's output and the two do not race when re-staging. Independent jobs run in parallel.

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  jobs:
    - name: format-and-lint
      glob: "*.{ts,tsx}"
      group:
        piped: true
        jobs:
          - name: prettier
            run: pnpm exec prettier --write {staged_files}
            stage_fixed: true
          - name: eslint
            run: pnpm exec eslint --fix --max-warnings=0 {staged_files}
            stage_fixed: true

    - name: prettier-noncode
      glob: "*.{json,jsonc,md,yaml,yml}"
      run: pnpm exec prettier --write {staged_files}
      stage_fixed: true

    - name: gitleaks
      run: gitleaks protect --staged --redact --no-banner

    - name: typecheck
      run: pnpm exec turbo run typecheck --cache=local:rw,remote:r

pre-push:
  parallel: true
  jobs:
    - name: verify
      run: pnpm verify
    - name: test-coverage
      run: pnpm test:coverage
```

`gitleaks protect --staged` is the pre-commit form for gitleaks 8.x; on gitleaks 8.18 and later use the equivalent `gitleaks git --staged --redact`. The same gitleaks scan runs authoritatively in CI regardless, so a bypassed hook is still caught.

## Test Layers (ADR-0065)

Three layers, each defined by where its Postgres comes from and what failure class it catches.
The agent-facing one-command loop is documented in [docs/agents/testing.md](agents/testing.md).

1. **Unit tests (`test`).** Plain Node Vitest, no database. Runs locally, in pre-push, and in the `CI` workflow's `Verify` job. No external secrets. Coverage (`pnpm test:coverage`) runs the same unit suite with v8 coverage and enforces the ratchet thresholds in `vitest.config.ts`; it excludes integration and RLS suites so it stays DB-less. `@cloudflare/vitest-pool-workers` is deliberately not used: the `postgres` driver needs a raw TCP socket that workerd cannot reach locally without a Hyperdrive binding, so a workers-pool run would have to mock persistence (deferred, not rejected, per ADR-0065).
2. **Integration and RLS tests (`test:rls`, `test:e2e`, `test:canary`).** Plain Vitest with `postgres.js` against Docker Compose Postgres 17 (ADR-0065; major pinned by ADR-0060). `test:rls` and `test:e2e` connect as the `NOBYPASSRLS` runtime role through `DATABASE_URL_RUNTIME`; `test:canary` sweeps every `public` schema column via the migration-role connection (`DATABASE_URL_MIGRATION`) plus captured in-process console output ([ADR-0069](adr/0069-no-plaintext-canary-gate.md)). The ADR-0054 invariants stand: never SQLite or PGlite for RLS/e2e, never the migration role for RLS/e2e, and CI asserts the runtime and migration credentials are distinct. Runs locally via `pnpm dev:db:reset && pnpm test:rls && pnpm test:e2e && pnpm test:canary` and in the `CI` workflow's `postgres-integration` job (INS-144) with `INSECUR_CI_RLS_GATE=1` so skipped suites fail the build. This is the authoritative RLS gate; it holds no secrets, so it is fork-safe and runs on every pull request. Use `prepare: false` in the `postgres.js` client (Hyperdrive and pooled connections do not support prepared-statement caching across connections).
3. **Preview smoke (gated).** The `pr-preview` workflow deploys a per-PR preview Worker backed by an ephemeral Neon branch through Hyperdrive and runs the First Value smoke over HTTP. It is the only layer that can catch a broken deploy, a missing binding, or a bad secret. Gated behind the repository variable `PREVIEW_ENV_ENABLED` until the preview infrastructure exists (INS-164); secret-bearing, so it never runs on forked pull requests.

Docker Compose Postgres is the substrate for the authoritative integration+RLS gate and uses the
same major version as the stable Neon target, currently Postgres 17 (ADR-0060), so the integration
layer and the Neon-backed preview environment do not drift.

## CI Topology (ADR-0029)

GitHub Actions on Blacksmith-hosted runners (ADR-0061). Every job sets `runs-on` to a Blacksmith runner label (e.g. `blacksmith-4vcpu-ubuntu-2404`), not `ubuntu-latest`; the Blacksmith GitHub App must be installed on the org. Every job installs with `pnpm install --frozen-lockfile` on Node 24 and reads the remote cache; only CI writes it.

### Required status-check workflow: `CI` (`ci.yml`)

Trigger: `pull_request` and `merge_group`. Runs the deterministic floor with no secrets. Branch protection keys on the job names within this workflow (`Verify`, `Coverage`, ...), not the workflow name, so the jobs are the required checks:

```
turbo run lint typecheck build test --cache=local:rw,remote:rw
prettier --check .
test:coverage (unit coverage, enforces ratchet thresholds; DB-less)
postgres-integration (Docker Compose Postgres 17: assert:rls-credentials, test:rls, test:e2e, test:canary, instance-bootstrap integration)
knip (unused files, deps, and unlisted deps)
actionlint (workflow lint + run-block shellcheck)
gitleaks (full working tree, authoritative)
semgrep (stock rule packs; SAST; fills the project-status SAST gap)
syft (generate SBOM) then grype (scan SBOM for known CVEs)
jscpd duplicate-code: warning annotations + blocking ratchet (duplicates:ci, threshold 0.5%)
```

These jobs are required status checks on the protected branch. They run for forked pull requests too, because they touch no secrets.

### Preview workflow: `pr-preview` (gated)

Trigger: `pull_request`, but the deploy job runs only when the repository variable
`PREVIEW_ENV_ENABLED` is `'true'` and the PR head is not a fork (see Fork Isolation). The workflow
is built but inert until the preview infrastructure lands; standing it up and flipping the flag is
INS-164. It runs the preview-smoke test layer, not `test:rls`. Steps:

1. Create a Neon branch for the PR (`neondatabase/create-branch-action`).
2. Verify branch isolation: the PR branch id must exist and differ from the production branch id.
3. Run migrations against the branch under the elevated migration role.
4. Create or reuse the per-PR Hyperdrive (`scripts/ci/create-hyperdrive.mjs`).
5. Build and deploy the preview Worker (`--env preview`, per-PR name, per-PR Hyperdrive binding)
   using the CI machine token.
6. Wait for `/healthz` readiness (three consecutive 200s).
7. Run the First Value cloud smoke (`scripts/ci/smoke-first-value.mjs`, which hard-fails when
   `SMOKE_BASE_URL` is unset — no green-by-skip once the job runs).
8. Comment the preview Worker URL and Neon branch on the PR.

### Cleanup workflow: `pr-preview-cleanup`

Trigger: `pull_request` `closed`. Deletes the PR's Neon branch and tears down the preview deployment.

### Staging deploy: `deploy-staging`

Trigger: `push` to `main`. Auto-deploys the staging Worker environment using the CI machine identity, then smoke-checks. No human gate. Staging never holds real customer secrets (ADR-0029).

### Production deploy: `deploy-production`

Trigger: `push` to `main`, job bound to a GitHub Environment named `production` with a required reviewer. The required-reviewer approval is the wrench in the loop. On approval:

1. Take a fresh R2 backup or snapshot.
2. Apply Neon migrations under the elevated migration role (expand-contract, backward compatible only).
3. Deploy the production Worker using the CI machine token.
4. Smoke-check production.

The identity that executes this deploy is the CI machine token, distinct from the human approver. The approver's personal credentials are never the deploy credential (ADR-0029 amendment, ADR-0004).

### Daily security scan: `security-daily`

Trigger: scheduled `cron`, once daily. Runs grype or trivy for new CVEs against current dependencies, semgrep full scan, and gitleaks over history. Criticals open a Linear issue in project INS- and may trigger an automated remediation PR. Renovate runs on its own schedule honoring `minimumReleaseAge: "3 days"` and `internalChecksFilter: "strict"` so it will not open an update branch before the quarantine floor elapses.

## Two-Credential Model And Guardrail Assertions

Two distinct database credentials exist:

- `DATABASE_URL_RUNTIME`: the `NOBYPASSRLS` runtime role. This is what `test:rls` and the running product use.
- `DATABASE_URL_MIGRATION`: the elevated migration URL, used only to apply migrations.

Locally and in CI's `postgres-integration` job, `pnpm dev:db:reset` provisions both roles on Docker Compose Postgres and writes both URLs to `.env.local`; in the gated `pr-preview` workflow the migration URL is the Neon branch connection string held as a CI secret.

Connecting `test:rls` as the migration role silently disables RLS and turns the suite green while testing nothing (ADR-0054). The `postgres-integration` job must therefore run the `assert:rls-credentials` step before trusting `test:rls`, failing the build if either assertion does not hold:

1. `DATABASE_URL_RUNTIME` and `DATABASE_URL_MIGRATION` are not equal.
2. The runtime role does not bypass RLS. Connect as the runtime role and assert `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user` returns `false`.

## Fork Isolation

A forked pull request from an untrusted contributor must never receive a secret-bearing step: no Neon branch, no Cloudflare deploy token, no preview deploy. The gated `pr-preview` workflow guards every secret step on the PR not originating from a fork. An untrusted fork of a secrets manager must never touch a credential. `test:rls` is no longer secret-bearing: it runs against Docker Compose Postgres in the secretless `postgres-integration` job (ADR-0065), so it runs for fork PRs too. The `CI` workflow is the only thing a fork PR runs, and it holds no secrets.

## Code Review Gate

CodeRabbit performs automated PR review and is additive to the deterministic floor, not a replacement for it. Configure it through `.coderabbit.yaml`. CodeRabbit conversations must be resolved before merge. Branch protection requires the `CI` workflow's status checks, requires review approval, and has administrator bypass disabled so the protected branch rules apply uniformly, including to the operator. No force-push to the protected branch.

## Done

The build-tooling layer is complete when all of the following are verifiable:

- `pnpm install` runs on pnpm 10 and Node 24, fails on a wrong Node major (`engine-strict`), and fails if any non-allowlisted dependency requests a lifecycle script (`strictDepBuilds`).
- A dependency version published less than 3 days ago cannot be installed (`minimumReleaseAge: 4320`).
- `pnpm verify` runs the duplicate annotations and ratchet, knip, actionlint (when installed), `prettier --check`, lint, typecheck, and unit tests green locally, reading the remote cache but not writing it.
- A developer or agent run cannot write the remote cache; only CI can. Verified by inspecting the `--cache` flags and by a CI-only signing key.
- Editing a rule in `eslint.config.ts` busts the cached `lint` for every package.
- A function over the complexity/size budget (complexity 8, 50 lines, 15 statements, depth 3, 4 params) or a non-test file over 250 lines fails `lint` at pre-commit and in `CI`; test files are exempt from the two length caps only.
- An upstream type error fails a downstream `typecheck` rather than returning a stale cached pass (the `topo` transit node works).
- `pnpm duplicates:warn` emits GitHub warning annotations for every jscpd clone without failing `CI`; `pnpm duplicates:check` is available as the strict local zero-threshold gate.
- A commit that introduces a type error, a lint error, a formatting drift, or a staged secret is blocked at pre-commit; a push with a failing local test or a coverage threshold regression is blocked at pre-push; `--no-verify` bypasses locally but the same checks block in `CI`.
- `test:rls` connects as `NOBYPASSRLS` and the CI guardrail assertions pass: the two database credentials differ and the runtime role does not bypass RLS.
- A forked pull request runs the `CI` workflow only and reaches no secret-bearing step.
- A merge to `main` auto-deploys staging; a production deploy waits on a GitHub Environment required reviewer and runs under a machine identity distinct from the approver.
- The daily security scan runs and files criticals to Linear project INS-.
- Branch protection has administrator bypass disabled and requires the `CI` workflow's checks plus review approval.
