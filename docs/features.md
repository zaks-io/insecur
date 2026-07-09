# Delivered Features

Last reviewed: 2026-07-09.

This is the agent-readable map of major functionality that is implemented in the current checkout.
It is not the future product spec, customer-validation plan, or production launch gate. "Delivered"
here means the codebase has the command, route, package, and test surface for the capability. It
does not mean the capability is production-launched, customer-validated, or proven against every
hosted environment.

For exact route mounts, use [specs/deploy-route-inventory.md](specs/deploy-route-inventory.md). For
current verification status and missing launch work, use [project-status.md](project-status.md).

## Capability-Isolated Worker Fleet

The app runs as separate Cloudflare Worker deploys instead of one monolith:

- `apps/api` is the public API edge. It owns HTTP request handling, auth, request parsing, stable
  error envelopes, and the public `/v1/*` route groups. It has no root-key or Hyperdrive binding.
- `apps/runtime` is the private decrypt-capable Runtime Worker. It owns DB access, keyring
  construction, secret encryption/decryption, and RuntimeService RPC methods reached only over a
  private Service Binding.
- `apps/web` is the authenticated Web Console BFF. It owns browser session handling, CSRF, WorkOS
  browser flows, and private API-hop rendering for the console.
- `apps/site` is the public site. It owns the landing/security/legal surface, CLI installer scripts,
  coverage badge JSON, and public audit-export signing-key metadata. It has no auth, DB, API,
  Runtime, or keyring capability.

The deploy topology conformance gate enforces the important boundary: exactly one deploy can hold
`INSTANCE_ROOT_KEY_V1`, and that deploy serves no public product routes.

## First Value Secret Loop

The core product loop is implemented for non-protected development secrets:

- provision or use an Organization, Project, and development Environment
- create or update a Secret by Variable Key through a Blind Secret Write
- generate a secret value server-side or accept it through safe CLI input
- persist only wrapped secret material and metadata
- issue a one-use Runtime Injection Grant
- consume the grant inside the Runtime Worker
- inject the value into one child process without printing it in CLI/API output

The copyable proof lives in [examples/first-value-proof](../examples/first-value-proof). The loop is
covered by the API e2e test and by the local CLI feature suite.

## Local Mode

Local Mode is implemented as an accountless version of the same development loop. An unauthenticated
`insecur init` creates a local project config with `"host": "local"` and uses an encrypted
machine-local store instead of the hosted API.

Delivered Local Mode behavior:

- encrypted SQLite store for Projects, Environments, Secret Shapes, current wrapped Secret Versions,
  one-use Injection Grants, and metadata-only local audit events
- machine root-key custody through macOS Keychain, Windows DPAPI, Linux `secret-tool`, or a
  documented `0600` fallback file
- `insecur secrets set`, `secrets list`, `secrets versions`, and `run --variable-key` against the
  local store
- local `.env` import for development adoption, with dry-run preflight and metadata-only output
- local plaintext file removal helper after import
- explicit `local.cloud_feature_unavailable` errors when a hosted-only command is attempted

The ceiling is intentional: Local Mode supports Projects and non-protected development
Environments. It does not express Organizations, Teams, Memberships, Protected Environments,
machine access, App Connections, Secret Sync, or production delivery.

## CLI Operating Surface

The `insecur` CLI is implemented as the main operator and agent-facing interface. Current top-level
commands include:

- `login`, `logout`, `shell`, `whoami`, and `agent` for auth, sessions, and attribution
- `init`, `config`, `orgs`, `projects`, and `envs` for local and hosted context setup
- `secrets set`, `secrets list`, `secrets versions`, `secrets promote`, and `secrets rollback`
- `run` for Runtime Injection from one Variable Key or a profile/policy
- `import` and `local-files rm` for one-way development `.env` adoption
- `scan` for offline secret exposure discovery
- `audit tail`, `audit export`, and `audit verify`
- `approvals`, `operations`, `run-policies`, and `connections`
- `guide` for offline CLI playbooks

The CLI owns command parsing, safe secret input, JSON/human output rendering, local config/profile
resolution, child-process spawning, and HTTP/local API clients. Server-side authorization,
encryption, and persistence stay in their owning packages and Workers.

## Secret Exposure Discovery

The scanner is implemented as a metadata-only discovery tool for agent-era secret risk:

- project-scoped scans find likely plaintext secret files without printing values
- strict mode fails when likely secrets are found
- transcript scanning answers whether local agent conversation logs appear to contain secrets
- agent-project scanning discovers project directories that agents touched, then inventories
  readable `.env`-style secret files in those projects
- machine-readable output is available for automation

This is separate from customer validation. It is a delivered CLI feature for finding current local
risk and turning it into targeted cleanup.

## Auth, Sessions, And Agent Attribution

Human and CLI session primitives are implemented:

- WorkOS-backed session validation
- CLI AuthKit PKCE authorize/exchange routes
- CLI device authorization/token routes
- short-lived CLI credentials returned through headers, not response bodies
- `GET /v1/session/whoami` for actor, session, resolved context, and attribution tier
- self-revocation for CLI sessions
- derived agent child sessions from a live human session
- structural agent registration for detected harnesses
- test-only fake session composition that is rejected by deployable env-backed auth composition

The product can distinguish direct human use, registered agent sessions, tag-only agent attribution,
and derived child credentials in metadata.

## Tenancy, Onboarding, And Membership

The tenant control-plane basics are implemented:

- instance bootstrap status and Bootstrap Operator Claim completion
- Guided Personal Organization provisioning
- first Project and development Environment provisioning
- operator-created Organizations
- Organization member and pending-invitation metadata reads
- invitation create and accept flows
- project and environment list/create routes
- tenant-scoped persistence through Postgres RLS and runtime-role guards

These surfaces are designed around opaque resource IDs and metadata-only output.

## Secret Store And Custody Core

The custody core is implemented behind package seams:

- public-safe secret write validation, including Variable Key, UTF-8, size, and empty-value behavior
- Blind Secret Write for non-protected development secrets
- Secret Version Store append/current-version behavior
- wrapped organization/project data keys
- AES-GCM envelope encryption with ciphertext identity binding
- request-scoped Runtime keyring construction
- Secrets Store root-key provider for Worker deploys
- root-key rewrap primitive
- decrypt-import lint boundary and package-boundary conformance

The public/API side works with contracts and wrapped material. Decrypt-capable code stays in the
Runtime deploy and crypto/keyring packages.

## Runtime Injection And Policies

Runtime Injection is implemented for both the First Value path and policy-shaped flows:

- issue grants for exact selectors
- consume a one-use grant and return a delivery envelope for child-process injection
- consume all bindings on a grant for policy/profile runs
- record run completion metadata
- list active and consumed grant metadata in the console/API
- create, show, and disable Runtime Injection Policies

The value is delivered only to the intended runtime boundary. CLI/API outputs remain metadata-only.

## Public Documentation Surface

The Public Site serves user-facing documentation built for humans and agents:

- `/docs/` renders the markdown content tree in `apps/site/src/docs/content` (getting started,
  concepts, guides, reference)
- every page is dual-format: rendered HTML at `/docs/<slug>` plus a raw markdown twin at
  `/docs/<slug>.md`, and `/llms.txt` indexes the markdown twins for agent consumption
- the CLI reference, exit-code, and error-code pages are generated from the real commander tree
  and the normative error registry by `pnpm docs:cli`; the site build regenerates them, a
  pre-commit hook stages them, and `pnpm docs:cli:check` in `verify:policy` fails CI on drift
- `/errors/<slug>` landing pages resolve the RFC 9457 error `type` URIs
  (`https://insecur.dev/errors/<slug>`; insecur.dev binds the same Site Worker)
- a lockstep test in `@insecur/cli` validates every `insecur` invocation in the hand-written
  pages against the real command tree

## Metadata Web Console

The Web Console BFF has implemented authenticated routes for the main metadata and approval views:

- WorkOS login, callback, logout, passkey enrollment, step-up, and approval step-up routes
- first-run onboarding with Guided Organization Provisioning and CLI handoff
- organization switcher and org-scoped console layout
- Home with pending work and recent activity
- Projects list and project detail layout
- Environments, Secrets matrix, Access, and Delivery project sections
- secret-in-environment version history
- People register with members and pending invitations
- filterable Audit event log
- Approvals inbox and approval detail deep links
- `/whoami` proof route

The console is a metadata surface. It shows identities, resources, versions, grants, audit entries,
and approval evidence, not secret values or credential material.

## Approvals And High-Assurance Review

The approval substrate is implemented beyond static status pages:

- Approval Request list/detail/approve/reject/cancel API routes
- High-Assurance Challenge list/detail/clear/deny API routes
- browser step-up routes that verify fresh WorkOS/AuthKit evidence before clearing a challenge
- Human Approval Surface console routes for pending work and detail pages
- metadata evidence for actor chains, target resources, staleness, and operation-bound decisions

This is the basis for protected-delivery approval. Full production delivery still depends on the
remaining production gates listed below.

## App Connections

App Connection management is implemented as metadata-safe setup infrastructure:

- list, create, status, rotate, reauthorize, and disconnect commands/routes
- GitHub App and Cloudflare scoped-token connection model support
- encrypted provider credential attachment
- Cloudflare connection-boundary validation and sync-eligibility checks
- audit events for connection create, credential attach, validation, denial, and disconnect
- metadata-safe connection status projections that do not expose provider credentials

GitHub App installation verification is not delivered yet and fails closed instead of activating a
connection from locally supplied installation metadata. Actual provider secret writes and end-to-end
GitHub/Cloudflare Secret Sync are also not delivered yet.

## Operations, Audit, Webhooks, And Evidence

Operational control surfaces are implemented:

- Operation Store create/get/wait/cancel behavior
- metadata-safe progress and result envelopes
- retry/resume states, incomplete states, fencing tokens, leases, and lazy abandonment recovery
- tenant-qualified audit event writes and metadata allowlist checks
- audit event feed with filters and pagination
- audit export route with JSONL plus signed manifest shape
- public audit-export signing-key metadata endpoint on the site Worker
- webhook subscription CRUD, event-type listing, and signing-secret rotation
- release-gate evidence bundle skeleton and metadata-safety checks

Production backup freshness, tested restore evidence, and full production release-gate automation
are still not delivered.

## Verification And Safety Gates

The repo has delivered the engineering guardrails that make the implemented surface harder to
accidentally weaken:

- Node 24 and pnpm 10 workspace baseline
- Turbo lint/typecheck/test graph
- Prettier, ESLint, knip, duplicate-code, actionlint, and GitHub Actions pinning gates
- generated route inventory with topology conformance
- package-boundary conformance preventing public/contract packages from importing crypto
- site-boundary conformance for the public site
- Wrangler type-generation conformance
- forced-RLS test layer
- e2e First Value test layer
- no-plaintext canary sweep
- local smoke and preview smoke entrypoints
- local CLI feature suite for Local Mode

## Not Delivered Yet

These are the major product surfaces that should not be described as delivered:

- production launch acceptance
- actual provider Secret Sync writes to GitHub Actions or customer Cloudflare Workers
- Vercel Secret Sync
- Storage Security Gate enforcement before production delivery/decrypt/provider write
- complete protected machine Runtime Injection flow
- Environment Deploy Key fallback and rotation policy
- production backup export pipeline and tested restore drill
- launch-grade root-key escrow access-log evidence
- full production deploy/decrypt smoke
- customer validation evidence

Protected Environment Secret Reveal is not "not yet delivered." It is intentionally not a feature.
