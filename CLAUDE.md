# insecur

insecur is no-reveal secrets custody for teams shipping with agents and CI. See `docs/vision.md` for the north star: what this is, what it is trying to accomplish, and the overall direction of the repo.

This project is not live yet and has no users. We are still building out, configuring, and verifying the application before going live. There is no production data worth protecting.

During this build-out period:

- Destructive operations (dropping databases, wiping state, resetting environments, recreating schemas) are fine and do not need extra confirmation.
- Do not write data-preservation migration scripts, backwards-compatible schema changes, or multi-step rollout plans to protect data that does not exist. Just change the schema and reset. Prefer recreate-from-scratch over migrate.
- Deployment and CI/CD process changes are approved during prelaunch, and agents may run preview,
  staging, or production deploy commands needed to validate the release path. Keep Sensitive Values
  out of logs and preserve the capability-isolation invariants below. This standing approval ends
  once the project has real users or real production data.
- Secret rotation, real migrations, and staged rollout plans come later, once we are live.

This stays true until the project actually ships.

## Architecture invariants (non-negotiable)

The only value of this project is a system that is actually secure in production. A half-built or
insecure version is worthless. Hold these invariants on every change; they are owned by
`docs/specs/product-spec.md` §2 and enforced by the deploy-topology conformance gate
(`pnpm conformance:topology`, `scripts/ci/deploy-topology-conformance.mjs`) plus the lint keyring
boundary in `eslint.config.ts`, both inside `pnpm verify` (INS-199). The authoritative route → deploy
table is `docs/specs/deploy-route-inventory.md`.

- **Worker deploys are capability-isolated. Never a monolith.** V1 runs separate Cloudflare Worker
  deploys: `apps/api` (public edge, no keyring), `apps/runtime` (sole holder of `INSTANCE_ROOT_KEY_V1`,
  the only place decrypt happens, no public routes, reached only over a private Service Binding via a
  `WorkerEntrypoint` RPC seam), and `apps/web` (BFF). Service Access is a separate deploy, deferred.
- **No deploy holds both a public route and the root-key binding.** Exactly one deploy declares
  `INSTANCE_ROOT_KEY_V1` and it serves zero public routes. A new route belongs to a specific deploy by
  capability — never pile routes into a single worker.
- Capability isolation is structural (separate deploys + token audiences + private Service Binding),
  not a code conditional. See ADR-0051/0064/0071/0077; decomposition tracked in epic INS-194.

## Agent skills

Workflow logic lives in the shared `ziw-*` skills under `skills/*/SKILL.md` (canonical source is
the shared skills repo; the in-repo copies are generated, never hand-edit them). Repo-specific
workflow values live in `docs/agents/workflow/config.md`, the only repo-side workflow doc. Read
that config first, then the matching skill: `ziw-to-issues` (spec/PRD/epic into `kind-slice`
tickets), `ziw-triage` (tracker readiness repair), `ziw-orchestrate` (the work loop),
`ziw-implement` (one startable issue through PR), `ziw-code-review` (review gate), `ziw-pr` (PR
creation), `ziw-setup` (create/refresh the config). Do not duplicate skill workflow logic into
repo docs or runtime adapters; a repo doc that restates or contradicts a skill is a defect.

Runtime-specific files (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/insecur.mdc`) are short adapters
only; keep Codex, Claude, and Cursor aligned through the skills and the config.

### Fast repo navigation

Use `docs/agents/repo-navigation.md` when you need to quickly find the right status doc, spec,
context map, package owner, Linear workflow doc, or repo-local skill. Start with
`docs/project-status.md`, then `CONTEXT-MAP.md`, then the local `CONTEXT.md` for the app or package
you will touch.

### Issue tracker

Issues are tracked in Linear team `INS` using the Linear MCP server. Tracker values, labels,
statuses, and policies are in `docs/agents/workflow/config.md`; the workflow itself is the `ziw-*`
skills.

### Triage labels

This repo uses the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context domain doc layout rooted at `CONTEXT-MAP.md`. See `docs/agents/domain.md`.

### Specs and source of truth

Content ownership, the single-statement rule, and deterministic doc-conflict resolution are
defined in the Source Of Truth Rules in `docs/specs/README.md` (decision record: ADR-0067). When a
non-owning doc disagrees with its owning doc, the non-owning doc is the defect: proceed on the
owner's content and file the defect. Only owner-vs-owner conflicts (for example spec vs ADR) stop
work and reopen the decision.

### Project status and roadmap

Current implementation status and next steps are tracked in `docs/project-status.md`. High-level
milestone sequencing for the agent-fleet build-out is `docs/roadmap.md`.

### Testing

The three-layer test strategy (unit / integration+RLS / preview smoke) and the agent
one-command loop (`pnpm dev:db:reset && pnpm test:e2e`) are documented in
`docs/agents/testing.md`; the decision record is `docs/adr/0065-test-layers-and-preview-smoke.md`.

### Cursor Cloud environment

Remote Cursor agent setup and maintenance notes live in `docs/agents/cursor-cloud-environment.md`.
Runtime roles and access rules are in `docs/agents/workflow/config.md` (Agent Runtimes).

## Cursor Cloud specific instructions

The `.cursor/environment.json` and `.cursor/Dockerfile` are the environment source of truth. The Dockerfile pins `node:24-bookworm` and corepack-activated `pnpm@10.19.0`. If the Dockerfile image is not yet built for your session, install Node 24 via nvm (`nvm install 24 && nvm use 24`) before running pnpm.

### Quick reference

- **Install deps:** `pnpm install --frozen-lockfile`
- **Verify:** `pnpm verify` (single-pass annotated zero-duplicate gate, knip, actionlint, deploy/package/site conformance, format check, lint, typecheck, and unit-test task fan-out)
- **CI check alias:** `pnpm ci:check` (same as `pnpm verify`)
- **Duplicate scan:** `pnpm duplicates:check` (strict jscpd zero gate). CI/pre-push enforce `pnpm duplicates:ci` (zero-duplicate gate, delegates to `duplicates:check`).
- **Unused code/deps:** `pnpm knip` (blocking in CI, pre-push, and verify)
- **Workflow lint:** `pnpm lint:actions` (actionlint; blocking in CI, optional-local in pre-push/verify)
- **Typecheck:** `pnpm typecheck` (runs across every workspace project: 22 packages + 4 apps)
- **Dev check:** `pnpm dev:check` (Node, pnpm, Wrangler, and scaffold file checks)
- **Local Postgres:** `pnpm dev:db:reset` (Postgres 17 Docker Compose, local-only role guard)
- **Build:** `pnpm build` (includes the Worker dry-run deploys through `apps/api/wrangler.jsonc` and `apps/runtime/wrangler.jsonc`)
- **Worker dev:** `pnpm dev:workers` (runs `insecur-api` + `insecur-runtime`) then check `http://localhost:8787/healthz`
- **Hello-world proof:** `INSECUR_PROOF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node examples/first-value-proof/verify.mjs`

### Known caveats

- `engine-strict=true` in `.npmrc` means `pnpm install` will hard-fail if Node is not on major 24. Always verify `node --version` first.
- `@insecur/api` (the public API Worker, `insecur-api`) serves `/healthz` liveness plus the `/v1/auth`, `/v1/session`, `/v1/onboarding`, `/v1/orgs/:organizationId/projects`, and `/v1/orgs/:organizationId/runtime-injection` product routes. Keyring-bound work (secret write = encrypt, grant consume = decrypt) is forwarded over the private `RUNTIME` Service Binding to `@insecur/runtime` (`insecur-runtime`), the sole holder of `INSTANCE_ROOT_KEY_V1` and the only deploy that decrypts; it serves zero public routes. `pnpm test:e2e` drives the First Value loop through these real routes against the multi-deploy shape. The authoritative route → deploy table is `docs/specs/deploy-route-inventory.md`, enforced by `pnpm conformance:topology`.
- jscpd duplicate-code detection: `pnpm duplicates:check` is the strict zero gate; `pnpm duplicates:ci` delegates to it and is the blocking CI/pre-push path. `pnpm duplicates:warn` only emits annotations and is non-blocking. knip (`pnpm knip`) is also blocking in CI, pre-push, and verify; its `types` dead-code rule is enabled (INS-311) and only the `exports` rule remains off in `knip.json` — enabling `exports` is the remaining eligible follow-up config change (`docs/build-tooling.md`).
- Local Postgres is an iteration aid only. It is pinned to Postgres 17 until ADR-0060 changes because Postgres 18 is still preview on Neon.
- `pnpm test:rls` runs the real forced-RLS tenant suite (requires `DATABASE_URL_RUNTIME`); it now executes in CI's `postgres-integration` job alongside `pnpm test:e2e` (the First Value loop through the real Worker routes). See `docs/agents/testing.md`.
- Lefthook pre-commit runs staged Prettier/ESLint, optional local gitleaks (skipped when `gitleaks` is not on PATH), and `turbo typecheck`; pre-push runs `pnpm verify` + `pnpm test:coverage`, mirroring CI's `Verify` and `Coverage` jobs so lint/type/test/format/dup/knip/actionlint/coverage churn is caught before pushing. The `CI` (`ci.yml`) and `security-daily` workflows add the security scanners (gitleaks, semgrep, syft+grype) on Blacksmith runners; those stay CI-only and out of the push hot path (`docs/build-tooling.md`).
- `pnpm-workspace.yaml` has `strictDepBuilds: true` and `onlyBuiltDependencies` allowlist. Adding a dependency that runs lifecycle scripts requires an explicit allowlist addition.
- M0 contract-and-gate enforcement (2026-06-12 ADR batch) is blocking in CI: the Plaintext Metadata Allowlist conformance gate (ADR-0070) runs in `pnpm verify` and `pnpm test:rls`; the package-boundary conformance gate runs in `pnpm verify` to keep public/contract packages off the crypto graph; the role-bundle registry conformance suite (ADR-0034) and machine-only `runtime_injection:grant_issue_protected` atom (ADR-0038) run in `@insecur/access` tests; the `OPERATION_INTENT_CODES` catalog (ADR-0068), `operation.idempotency_mismatch` check (ADR-0066), and non-lease `execution_deadline` claims with lazy abandonment recovery (ADR-0073) run in `@insecur/operations`; the no-plaintext canary gate `pnpm test:canary` (ADR-0069) runs in the `postgres-integration` job after `test:e2e`; the exit/HTTP lockstep test (ADR-0062) runs in `@insecur/worker-kit`; the decrypt-import lint boundary (ADR-0071) is enforced via `eslint.config.ts` inside `pnpm verify`.
