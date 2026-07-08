# Project Status

Last updated: 2026-07-07

This is a code and runtime status snapshot. It says what is delivered now, what was
verified, and what is still missing. It is not the normative product spec. When this
file disagrees with an owning spec, ADR, or verified code, follow the owner and treat
this file as the defect. The authoritative route to deploy table is
[specs/deploy-route-inventory.md](specs/deploy-route-inventory.md).

## Status At A Glance

The repo is not a scaffold anymore. The current delivered product surface is a
deployable preview/nonprod First Value loop with capability-isolated Workers, real
Postgres/RLS persistence, wrapped data keys, root-key-backed encrypt/decrypt, and CLI
commands that target the same API shape.

What is delivered:

- `apps/api` is the public API Worker. It exposes the `/healthz` and `/v1/*` route
  groups listed in the route inventory.
- `apps/runtime` is the private Runtime Worker. It owns DB access, the root-key
  binding, keyring construction, encrypt, decrypt, and non-keyring tenant DB work
  reached over the private `RUNTIME` Service Binding.
- `apps/web` is the Web BFF (`insecur-web`): TanStack Start on Workers with a private
  `API` Service Binding hop and a `/whoami` authenticated proof route (INS-201).
- The repo has 26 workspace projects (22 packages + 4 apps) on Node 24 and pnpm 10.
- The local verification floor passes.
- The local DB-backed RLS, e2e, and no-plaintext canary layers pass after a fresh
  local Postgres reset.
- The shared Cloudflare preview deploy path is package-level Turbo deploys for Runtime,
  API, Web, and Site. The intended preview URLs are `https://api.preview.insecur.cloud`,
  `https://app.preview.insecur.cloud`, and `https://preview.insecur.cloud`; Runtime has
  no public route. Private Worker IDs are supplied by Preview/Production GitHub
  Environment variables during deploy, not committed Wrangler config.
- The nonprod root key in Cloudflare Secrets Store has been regenerated, escrowed in an
  operator vault, and verified through the deployed preview smoke.

What is not delivered:

- No production launch gate is complete.
- Full tenant web console UX (beyond the INS-201 BFF scaffold and `/whoami` proof).
- No provider sync to GitHub or customer Cloudflare Workers exists.
- No Storage Security Gate enforcement is wired into production delivery.
- No hosted web-console WorkOS login/logout/callback UI, MFA enrollment, or high-risk
  challenge flow exists.
- CLI WorkOS login now has a PKCE loopback implementation in code, but it has not yet
  been deployed to and verified against preview.
- No authenticated CLI success transcript against the deployed preview exists yet.
- No production decrypt path was exercised in this verification pass.
- The operator-vault escrow evidence is recovery evidence, but not launch-grade
  out-of-band access-log evidence unless it is moved to or backed by an organization
  vault with event logs.

## Historical Preview Verification Snapshot From 2026-06-29

Local checkout at that time:

- Branch: `main`
- HEAD: `e1c1dd4179a1f6536e6ef2f6b75373ff488ed675`
- Working tree: dirty with local PKCE login implementation and status-doc edits, not
  committed
- Open GitHub PRs: none at the time of verification
- Toolchain: Node `v24.16.0`, pnpm `10.19.0`

Commands run locally for that PKCE login change:

```sh
pnpm verify
pnpm build
pnpm duplicates:ci
pnpm --filter @insecur/cli start --host https://api.preview.insecur.cloud login --help
pnpm deploy:preview
```

Results:

- Focused auth/API/CLI validation passed before the full repo gate:
  `@insecur/auth` lint/typecheck/test, `@insecur/api` lint/typecheck/session tests,
  and `@insecur/cli` lint/typecheck/test.
- `pnpm duplicates:ci` passed with 0 clones.
- `pnpm verify` passed. This includes duplicate-code gates, knip, actionlint,
  GitHub Actions SHA pinning, deploy topology conformance, package-boundary
  conformance, Prettier format check, lint, typecheck, and unit tests across the
  workspace.
- `pnpm build` passed. It built all 22 workspace projects and ran Worker dry-run builds.
  The dry-run output showed the API Worker binding only `env.RUNTIME`, and the Runtime
  Worker binding both `env.DB` and `env.INSTANCE_ROOT_KEY_V1`.
- Current CLI `login --help` starts with the preview host configured and shows the PKCE
  flags: `--no-open` and `--callback-port <port>`.
- `pnpm deploy:preview` did not deploy on that checkout because the previous preview deploy
  path required local smoke/migration configuration before any Worker deploy could start.
  The current deploy path uses package-level Turbo deploys for the preview Workers; the
  manual `Deploy Preview` workflow runs `pnpm migrate:preview` before deploy.
- The currently deployed preview still returns `200` for `/healthz`.
- The currently deployed preview returns `404` for `/v1/auth/cli/authorize`, proving
  the PKCE route is not deployed there yet.

Hosted preview verification before the local PKCE code change:

- GitHub run: recorded in private release evidence.
- Workflow: `Deploy Preview`
- Ref: `main`
- Commit: `e1c1dd4179a1f6536e6ef2f6b75373ff488ed675`
- Result: success
- Completed: `2026-06-29T16:40:51Z`
- Smoke input: `true`
- Runtime deployed: `insecur-runtime-preview`
- API deployed: `insecur-api-preview`
- Runtime binding resolved to the nonprod root-key Secrets Store binding.
- `/healthz` passed 3 consecutive checks.
- First Value smoke returned `{"ok":true,"smoke":"first-value-loop",...}`.

Preview CLI verification attempt:

- Target at the time: the deployed preview API Worker URL.
- Current API preview URL: `https://api.preview.insecur.cloud`
- `pnpm --filter @insecur/cli start --host <preview> --json --help` passed and
  listed the implemented CLI commands.
- Cloudflare preview API secrets are present by name:
  `RUNTIME_TOKEN_SIGNING_SECRET`, `SESSION_SIGNING_SECRET`, `WORKOS_API_KEY`, and
  `WORKOS_COOKIE_PASSWORD`. Cloudflare does not expose secret values.
- Deployable API auth composition now rejects non-empty `WORKOS_FAKE_SESSIONS_JSON` instead of
  selecting a fake adapter, and the preview API also does not bind that secret.
- Redacted local-env inspection found no `SESSION_SIGNING_SECRET`,
  `SMOKE_SESSION_SIGNING_SECRET`, `SMOKE_ADMITTED_USER_ID`, or
  `SMOKE_WORKOS_USER_ID` in `.env.preview`, `.env.local`, or `.env.production`.
- An isolated `insecur login` probe with an invalid fake WorkOS browser session reached
  the preview API and returned `auth.invalid`, as expected.

What this proves: the CLI binary starts, accepts the preview host, and reaches the
preview auth exchange route.

What this does not prove: successful preview `login`, `init`, `secrets set`, `run`, or
`shell`. Those require a valid CLI session credential, and this checkout currently has
neither a real WorkOS browser session nor the deployed nonprod session-signing secret
needed to mint the smoke credential locally. `audit verify` is a local audit-export
verification command and does not talk to the preview API.

Follow-up local code change after this hosted verification: `insecur login` now uses
only a WorkOS AuthKit PKCE loopback flow. The API owns
`GET /v1/auth/cli/authorize` for the AuthKit redirect and
`POST /v1/auth/cli/pkce/exchange` for code-verifier exchange plus Insecur CLI
credential minting. No CLI browser-session copy exchange path remains. This code is
local and verified by tests/build, but not yet deployed to preview.

Human evidence recorded:

- Root-key escrow items are visible in the operator vault.
- Cloudflare Secrets Store shows nonprod and prod instance root-key secrets as active.
- Cloudflare audit UI shows a Secrets Store secret update at `2026-06-29 09:00:15`,
  actor recorded in private release evidence, action `update`, resource
  `secrets_store / stores.secrets`, source `dash`.

## Delivered Code Surface

### Worker Deploys

`apps/api` is the public API Worker, script `insecur-api`.

It mounts:

- `GET /healthz`
- `/v1/auth`
- `/v1/session`
- `/v1/onboarding`
- `/v1/instance/bootstrap`
- `/v1/orgs/:organizationId/invitations`
- `/v1/orgs/:organizationId/organizations`
- `/v1/orgs/:organizationId/projects`
- `/v1/orgs/:organizationId/operations`
- `/v1/orgs/:organizationId/runtime-injection`

The API Worker does not bind the root key and does not bind Hyperdrive. Its Wrangler
config binds only the private `RUNTIME` Service Binding to
`insecur-runtime#RuntimeService` for default deploys, and to
`insecur-runtime-preview#RuntimeService` in the `preview` environment.

`apps/runtime` is the private Runtime Worker, script `insecur-runtime`.

It exposes no public product route. Its default `fetch` returns `404`. The actual
surface is `RuntimeService extends WorkerEntrypoint`, reached over the private Service
Binding. Runtime owns:

- request-scoped DB connection setup through `env.DB.connectionString`
- root-key access through `INSTANCE_ROOT_KEY_V1`
- secret write
- injection grant consume
- admission resolution and denial audit
- instance bootstrap status and operator claim
- guided organization provisioning
- operator-created organizations
- invitation create/accept
- operation polling
- injection grant issue

The deploy topology is enforced by `pnpm conformance:topology`: exactly one deploy
declares `INSTANCE_ROOT_KEY_V1`, and no deploy has both public routes and the root-key
binding.

### First Value Loop

The delivered First Value path is:

1. Authenticate an admitted user.
2. Provision or use an organization, project, and development environment.
3. Write a non-protected secret through the public API route.
4. Forward the write over `RUNTIME.writeSecret`.
5. Runtime authorizes, encrypts, and persists the wrapped value.
6. Issue a one-use Runtime Injection Grant.
7. Consume the grant through Runtime.
8. Runtime authorizes and decrypts the value.

This is verified two ways:

- local e2e: `apps/api/test/e2e/first-value-loop.e2e.test.ts`
- hosted preview smoke: `pnpm smoke:preview` against the deployed preview API/Web/Site and
  preview Neon/Hyperdrive/Runtime binding

The deployed preview smoke is the strongest evidence because it uses the real Cloudflare
Workers, the real `RUNTIME` Service Binding, the real Hyperdrive binding, the real
Cloudflare Secrets Store root-key binding, and the preview plaintext sweep.

### CLI

The CLI package is implemented and built. Commands present in code:

- `insecur login`
- `insecur login --shell`
- `insecur shell`
- `insecur init`
- `insecur secrets set`
- `insecur run`
- `insecur audit verify`

The CLI has local profile/config resolution, safe secret input paths, masked TTY input,
stdin/generation paths for secret values, metadata-only output rendering, child-process
environment construction, and HTTP clients for the First Value API routes.

Installer scripts are served by the Public Site Worker at `/install.sh` and `/install.ps1`
(`apps/site/src/install-sh.ts`, `apps/site/src/install-ps1.ts`): they fetch the `cli-v*`
GitHub Release binaries and verify them against `SHA256SUMS` before installing. The public
`curl | sh` path stays dead until the draft release is published and the repo is public;
until then end-to-end verification uses the `INSECUR_INSTALL_BASE_URL` fixture override.

Current login implementation:

- default `insecur login`: native-client WorkOS AuthKit PKCE loopback flow
- `insecur login --no-open`: prints the AuthKit URL for headless/manual use
- `insecur login --callback-port <port>`: pins the local callback port when the WorkOS
  redirect configuration requires it

What was verified against the currently deployed preview:

- `/healthz` returns `200`
- the old preview build does not have the PKCE authorize route yet:
  `/v1/auth/cli/authorize` returns `404`
- previous CLI probing against this preview proved the CLI starts with the preview host
  configured and reaches the legacy auth exchange route

What was not verified in this pass: successful authenticated CLI commands against the
deployed preview. The deployed smoke drove the same product route sequence directly
over HTTP, but it did not exercise the CLI command process, and the PKCE login code is
not deployed to preview yet.

What was verified locally after the PKCE implementation:

- API PKCE authorize route redirects to WorkOS AuthKit with the loopback redirect URI,
  state, code challenge, and `S256`.
- API PKCE exchange route mints a CLI credential header after fake WorkOS code exchange
  and persisted admission resolution.
- CLI default login uses a real local loopback callback and exchanges the returned code
  without copied browser-session material.

### Auth And Session

Delivered:

- WorkOS-backed session validation and config composition.
- `GET /v1/session/whoami`.
- WorkOS AuthKit PKCE authorization-code exchange for CLI credentials.
- Ephemeral CLI session credentials.
- Auth failure envelopes and request IDs.
- Explicit test/local fake-session support through test-only factories; deployable env-backed
  auth composition rejects fake-session configuration.

Not delivered:

- hosted web-console WorkOS login/logout/callback UI
- MFA enrollment UX
- high-risk action challenge flow

### Tenancy, Persistence, And RLS

Delivered:

- Drizzle-owned schema baseline.
- Raw SQL step for roles, grants, RLS policies, and lifecycle triggers.
- Local reset/migration tooling.
- Runtime role guard against bypass-RLS.
- Tenant-scoped transaction helpers.
- Forced RLS test layer.

Persisted domain tables include:

- instances
- organizations
- projects
- environments
- teams
- memberships
- user admissions
- organization and project data keys
- machine identities and memberships
- GitHub Actions OIDC machine auth methods
- secrets and secret versions
- injection grants
- audit events
- operations
- bootstrap claims/config
- invitations
- sync target leases

### Crypto And Custody

Delivered:

- Secrets Store root-key provider.
- Production refusal of plaintext root-key fallback.
- Request-scoped Runtime keyring construction.
- AES-GCM envelope encryption.
- wrapped organization/project data keys.
- root-key rewrap primitive.
- per-domain record type tags for secrets, provider credentials, and sensitive metadata.
- decrypt-import lint boundary.
- package-boundary conformance that prevents public/API and contract packages from
  depending on `@insecur/crypto`.

Nonprod custody status:

- `INSTANCE_ROOT_KEY_V1` is bound on the Runtime Worker only.
- Cloudflare Secrets Store item: nonprod instance root key.
- Store ID: recorded in private release evidence.
- The regenerated value was verified by deployed preview smoke.
- The escrow copy exists in the operator vault.

Remaining custody gap:

- Operator-vault access logging has not been verified. This is acceptable for pre-live
  nonprod recovery evidence, but it is not enough for a launch gate that requires
  out-of-band escrow access logs.
- The production root key secret and operator-vault item are visible in screenshots, but the
  production decrypt path was not exercised.

### Runtime Injection

Delivered:

- Public-safe grant issue path.
- Selector validation.
- One-use grant consume path.
- Runtime-side decrypt for injection.
- Metadata-only consume results.
- Denial audit behavior.
- Tests for issue, consume, selector matching, access checks, and decrypted value delivery.

### Secret Store

Delivered:

- Public-safe secret write validation.
- UTF-8 and 64 KiB value checks.
- Variable Key validation.
- Non-protected Blind Secret Write.
- Secret Version Store append/current-version behavior.
- Wrapped material persistence.
- Metadata-only write results.
- Denied write audit.

### Onboarding And Membership

Delivered:

- Guided Personal Organization provisioning.
- Default project and development environment provisioning.
- Operator-created organizations.
- Invitations.
- Project-scoped invitation acceptance.
- Membership management behavior.
- Audit events for the above paths.

### Instance Bootstrap

Delivered:

- Instance posture/config rows.
- Bootstrap Operator Claim.
- Bootstrap secret verifier hashing.
- Pending claim compare-and-set.
- First organization owner grant.
- Instance Operator grant.
- Bootstrap status route.
- Rollback on failed post-grant audit.

### Machine Auth

Delivered as package code:

- GitHub Actions OIDC JWT verification.
- Trusted repository/environment/audience matching.
- Tenant-scoped OIDC auth method loading.
- Short-lived machine access token mint/verify.
- Metadata-only exchange audit events.
- Machine Effective Access resolution through project-scoped Machine Identity memberships
  and Credential Scopes.

Not delivered:

- Worker route composition for the exchange.
- Environment Deploy Keys fallback.
- deploy-key rotation policy.
- complete protected Runtime Injection machine flow.

### Operations, Audit, And Release Gate

Delivered:

- Operation Store create/transition/progress/retry/cancel/poll.
- Metadata-safe operation progress.
- `blocked` and `incomplete` resume semantics.
- sync target key validation and leases.
- fencing tokens and stale-token rejection.
- non-lease `execution_deadline` claims.
- lazy abandonment recovery.
- metadata-only audit event validation and writes.
- denied-result codes.
- audit payload allowlist checks.
- release-gate evidence bundle skeleton and metadata-safety checks.

Not delivered:

- full production release-gate automation
- backup/export freshness control wired to live backup jobs
- tested restore drill
- audit export route/API

## Not Delivered Yet

These are concrete missing product/code surfaces, not tracker hypotheticals:

- Full tenant web console beyond the INS-201 BFF scaffold (`/whoami` proof only so far).
- Provider sync to GitHub Actions secrets.
- Provider sync to customer Cloudflare Worker secrets.
- Cloudflare App Connection and GitHub App Connection production flows.
- Storage Security Gate verdict enforcement before production delivery/decrypt/provider write.
- Production backup export pipeline and tested restore drill.
- Launch-grade root-key escrow access logging.
- Hosted web-console WorkOS auth UI, MFA, and high-assurance challenge UX.
- Machine auth exchange route and protected machine Runtime Injection flow.
- Authenticated live CLI transcript against the deployed preview after deploying the PKCE
  login loop and configuring the WorkOS redirect URI.
- Production deploy/decrypt smoke.

## Build Order

Working implementation sequence within V1 scope. Non-binding for finer release boundaries; see
[phasing.md](phasing.md) for the decided scope cut-line and [roadmap.md](roadmap.md) for milestone
exit gates.

1. **First Value** — guided Personal Organization provisioning, first Project, non-protected
   development Environment, service-generated Blind Secret Write, `run --variable-key`, Diskless
   Development Secret Use, and copyable First Value Proof.
2. **Local Mode** — account-less encrypted local development custody behind the ordinary CLI
   command surface (ADR-0080). Standalone-useful after First Value. Feature ceiling: Projects and
   non-protected development Environments only; no Protected Environments, Secret Sync, machine
   access, Teams, or Organizations locally.
3. **Production foundation** — tenant-first schema, organization/project memberships, role
   enforcement, WorkOS AuthKit, tenant-qualified routes, organization/project data keys, key
   versions, protected promotion/rollback, and security gates.
4. **Machine access and CI trust** — machine identities and GitHub Actions OIDC federation for
   short-lived CI access.
5. **Approval UX and delivery policy** — Human Approval Surface for protected gates plus Delivery
   Risk Policy Presets for explicit non-protected preview/development automation.
6. **Runtime Injection Delivery** — profile-backed `insecur run` for deploy and local command
   injection.
7. **Provider Sync: GitHub and Cloudflare** — OAuth app connections and sync engines for GitHub
   and direct Cloudflare Worker secrets.
8. **Audit, runbooks, and release gates** — audit export, tested restore evidence, security
   runbooks, and production release gates.
9. **Deferred scope** — tracked in [phasing.md#deferred-scope-parking-lot](phasing.md#deferred-scope-parking-lot),
   not in Linear until promoted in the repo docs.

## Source Pointers

- Worker route/deploy ownership: [specs/deploy-route-inventory.md](specs/deploy-route-inventory.md)
- API Worker composition: [../apps/api/src/index.ts](../apps/api/src/index.ts)
- API Worker bindings: [../apps/api/wrangler.jsonc](../apps/api/wrangler.jsonc)
- Runtime Worker RPC: [../apps/runtime/src/runtime-service.ts](../apps/runtime/src/runtime-service.ts)
- Runtime Worker bindings: [../apps/runtime/wrangler.jsonc](../apps/runtime/wrangler.jsonc)
- First Value e2e: [../apps/api/test/e2e/first-value-loop.e2e.test.ts](../apps/api/test/e2e/first-value-loop.e2e.test.ts)
- Preview deploy task: [../package.json](../package.json) and [../turbo.json](../turbo.json)
- Root-key runbook: [runbooks/instance-root-key-bootstrap.md](runbooks/instance-root-key-bootstrap.md)
- First-owner admission seed (interim, INS-419): [runbooks/seed-owner-admission.md](runbooks/seed-owner-admission.md)
