# Deploy route inventory (owner doc)

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm routes:inventory`. -->
<!-- Human-readable deploy intros and route notes live in deploy-route-inventory.sidecar.json. -->

This is the source of truth for which public HTTP route group lives on which Worker deploy
(ADR-0067 single-statement rule). The deploy-topology conformance gate
(`scripts/ci/deploy-topology-conformance.mjs`, INS-199) parses each `apps/*/src/index.ts` and
**fails CI** when the live route mounts drift from this table. A route on the wrong deploy is a
capability-isolation regression (ADR-0051/0064/0077), not a refactor — moving one here is a
reviewer-visible decision.

The format is exact: one row per `app.route(...)` / `app.<method>(...)` mount in the deploy's
composition root, listing the mount prefix verbatim. `/healthz` is a per-deploy liveness handler and
is expected on every deploy. The Runtime Worker MUST declare zero `/v1/*` routes — it is reachable
only over the private Service Binding via the `RuntimeService` RPC entrypoint (ADR-0077).

## API Worker — `apps/api` (`insecur-api`)

Public edge. Authenticates humans/agents, forwards keyring-bound work AND all non-keyring DB work (admission, onboarding, membership, operations, grant issue, bootstrap) to the Runtime Worker over the `RUNTIME` Service Binding. Holds NO root-key binding and NO Hyperdrive binding; performs zero DB I/O.

| Method | Mount prefix                                         |
| ------ | ---------------------------------------------------- |
| GET    | `/healthz`                                           |
| *      | `/v1/auth`                                           |
| *      | `/v1/instance/bootstrap`                             |
| POST   | `/v1/onboarding`                                     |
| GET    | `/v1/orgs/:organizationId/audit-events`              |
| GET    | `/v1/orgs/:organizationId/audit-export`              |
| *      | `/v1/orgs/:organizationId/connections`               |
| POST   | `/v1/orgs/:organizationId/design-partner-feedback`   |
| GET    | `/v1/orgs/:organizationId/first-value-usage`         |
| *      | `/v1/orgs/:organizationId/high-assurance-challenges` |
| *      | `/v1/orgs/:organizationId/invitations`               |
| GET    | `/v1/orgs/:organizationId/members`                   |
| *      | `/v1/orgs/:organizationId/operations`                |
| POST   | `/v1/orgs/:organizationId/organizations`             |
| *      | `/v1/orgs/:organizationId/projects`                  |
| *      | `/v1/orgs/:organizationId/run-policies`              |
| POST   | `/v1/orgs/:organizationId/runtime-injection`         |
| *      | `/v1/orgs/:organizationId/webhook-subscriptions`     |
| *      | `/v1/session`                                        |

Under `/v1/orgs/:organizationId/run-policies` (INS-437): `POST /` creates an immutable Runtime Injection Policy Version with exact secret bindings and updates the active pointer; `GET /:policyId` returns metadata-only policy show; `POST /:policyId/disable` disables a policy with audit. Protected Environment mutations require a High-Assurance Challenge (`auth.high_assurance_required` with `meta.operationId` when absent). All three forward over the `RUNTIME` seam.

Under `/v1/orgs/:organizationId/connections` (INS-441): `GET /` lists metadata-only App Connections; `POST /` creates a connection via provider authorization or scoped token input; `GET /:connectionId` returns metadata-only status; `POST /:connectionId/reauth` reauthorizes a connection; `POST /:connectionId/rotate` rotates credential-backed provider credentials (optional `dryRun`); `POST /:connectionId/disconnect` disconnects with audit. Create, credential replacement, reauth, and boundary changes require a High-Assurance Challenge. List/status never return provider credentials. All routes forward over the `RUNTIME` seam.

Under `/v1/orgs/:organizationId/projects` (INS-362): `GET /` lists project metadata; `POST /` creates a project with a client-minted opaque ID and Display Name; `GET /:projectId/environments` lists environment metadata (including `isProtected`); `POST /:projectId/environments` creates a non-protected development environment (optional Secret Shape copy from another environment in the same project); `GET /:projectId/secrets` lists the secrets × environments matrix metadata (presence, version, last-set actor/time; INS-363). `GET /:projectId/environments/:environmentId/secrets` lists environment-scoped Secret Shape metadata (variable key, opaque secret id, display name, current version pointer; INS-434). `GET /:projectId/environments/:environmentId/secrets/:secretId/versions` lists per-version metadata for one Secret (version ids, timestamps, current/published markers, principal-chain set actors; INS-380). `GET /:projectId/machine-identities` lists project-scoped machine identities and metadata-safe auth methods (INS-382; no credential material). `GET /:projectId/injection-grants` lists active/consumed Runtime Injection grant history with principal-chain attribution (INS-382; no token material). `POST /:projectId/environments/:environmentId/secrets/by-variable-key` remains the blind secret write path.

Under `/v1/orgs/:organizationId/first-value-usage` (INS-379): `GET /` returns metadata-only First Value usage counters for the onboarding handoff indicator (`secretWrites`, `grantConsumed`, `runCompleted`, `firstInjectionObserved`). Authorize-then-read requires `organization:read` inside the Runtime deploy.

Under `/v1/orgs/:organizationId/audit-events` (INS-364): `GET /` lists tenant-qualified audit events with metadata-only envelopes. Query filters: `actorUserId`, `actorMachineIdentityId`, `projectId`, `environmentId`, `eventCode`, `createdAtFrom`, `createdAtTo`, plus cursor pagination via `cursor` and bounded `pageSize`. Authorize-then-read requires `metadata:detail_read` inside the Runtime deploy.

Under `/v1/orgs/:organizationId/audit-export` (INS-440): `GET /` exports tenant-qualified audit events as JSONL plus a signed manifest for the requested `from`/`to` ISO8601 time range. Authorize-then-export requires `metadata:detail_read` inside the Runtime deploy; signing keys remain Runtime-custodied (ADR-0045/0028).

Under `/v1/orgs/:organizationId/webhook-subscriptions` (INS-453): `GET /event-types` lists selectable webhook event codes; `GET /` lists organization webhook subscriptions; `POST /` creates a subscription and returns a one-time signing secret; `PATCH /:subscriptionId` updates subscription metadata and selected event types; `DELETE /:subscriptionId` disables a subscription; `POST /:subscriptionId/rotate-signing-secret` mints a new signing secret and retires the prior active secret. Subscription CRUD requires `webhook:manage`; list/event-types require `webhook:read`. Delivery runs inside the Runtime deploy (in-app channel in V1).

Under `/v1/session` (INS-367, INS-430, INS-436, INS-446): `GET /whoami` echoes the verified actor plus session validity/expiry, resolved org/project/env context (optional `orgId`, `projectId`, `envId` query params), and attribution tier (`derived`, `registered`, `tag-only`, `none`). Optional agent inputs are `agentSessionId`, `agentTag`, `harnessName`, and `ancestryKey`; Tier-2 auto-registration runs when a harness is detected on a bare human token. `POST /agent/derive` mints a derived agent-marked child CLI credential from the live human session (credential returned only in `x-insecur-session-credential`; JSON body is metadata-only). `POST /agent/register` performs Tier-2 structural registration over the `RUNTIME` seam. Reads beyond the actor claim forward over the `RUNTIME` seam. `GET /memberships` is the console org-switcher self-read (the actor's own organizations), forwarded over the `RUNTIME` seam. `POST /revoke` ends the calling actor's own CLI session, forwarded over the `RUNTIME` seam; unauthenticated callers receive a metadata-only success no-op.

The People reads (INS-373): `GET /v1/orgs/:organizationId/members` lists membership metadata and `GET /v1/orgs/:organizationId/invitations` lists pending-invitation metadata (identifiers, role bundle, status, timestamps; invitations carry no token or acceptance secret). Both are `organization:read`-gated inside the Runtime deploy.

Under `/v1/orgs/:organizationId/high-assurance-challenges` (INS-361): `GET /` lists pending High-Assurance Challenge metadata for the Human Approval Surface; `GET /:operationId` returns one challenge's metadata evidence; `POST /:operationId/clear` clears with operation-bound fresh step-up evidence (`stepUpCode` and `stepUpCodeVerifier` in body, exchanged server-side via WorkOS/AuthKit for the same user/session); `POST /:operationId/deny` denies the bounded operation. All four are human-actor-only (`requireUserActor`) and authorize inside the Runtime deploy (`approval:approve` for clear, `approval:reject` for deny, either approval scope for list/get after `organization:read`).

## Web Worker — `apps/web` (`insecur-web`)

Browser-facing BFF (ADR-0051). Owns the human session cookie and reaches the API Worker only over the private `API` Service Binding with a per-request `insecur-api`-audience scoped token. Holds NO root-key binding and NO Hyperdrive binding.

| Method | Mount prefix                                                     |
| ------ | ---------------------------------------------------------------- |
| GET    | `/`                                                              |
| GET    | `/auth/callback`                                                 |
| GET    | `/auth/enroll-passkey`                                           |
| GET    | `/auth/enroll-passkey/callback`                                  |
| GET    | `/healthz`                                                       |
| *      | `/login`                                                         |
| POST   | `/logout`                                                        |
| GET    | `/onboarding`                                                    |
| GET    | `/orgs/`                                                         |
| GET    | `/orgs/$orgId`                                                   |
| GET    | `/orgs/$orgId/`                                                  |
| GET    | `/orgs/$orgId/approvals`                                         |
| GET    | `/orgs/$orgId/approvals/$id`                                     |
| GET    | `/orgs/$orgId/audit`                                             |
| GET    | `/orgs/$orgId/people`                                            |
| GET    | `/orgs/$orgId/projects/`                                         |
| GET    | `/orgs/$orgId/projects/$projectId`                               |
| GET    | `/orgs/$orgId/projects/$projectId/`                              |
| GET    | `/orgs/$orgId/projects/$projectId/access`                        |
| GET    | `/orgs/$orgId/projects/$projectId/delivery`                      |
| GET    | `/orgs/$orgId/projects/$projectId/envs/$envId/secrets/$secretId` |
| GET    | `/orgs/$orgId/projects/$projectId/secrets`                       |
| GET    | `/orgs/$orgId/settings`                                          |
| GET    | `/whoami`                                                        |

The `/orgs/*` rows are the authed console shell (INS-367): `/orgs/` resolves the default organization, `/orgs/$orgId` is the org-scoped layout carrying the five-section sidebar, and the section rows are TanStack file routes rendered inside it (`$orgId` is TanStack path-param syntax). The `/orgs/$orgId/projects/*` rows are the Projects section (INS-370): the project list, the project layout with its Environments (`/$projectId/`, the index) / Secrets / Access / Delivery views; all reads go through the BFF scoped-token hop to the INS-362 API metadata GETs. `/orgs/$orgId/projects/$projectId/secrets` is the read-only secrets × environments matrix (INS-375): presence, version, and last-set metadata over `GET .../projects/:projectId/secrets`, with protected-column marking and cross-environment drift emphasis; no secret values. `/orgs/$orgId/projects/$projectId/access` is the read-rich Access view (INS-382): machine identities, active/consumed grants, and agent-session attribution over `GET .../machine-identities` and `GET .../injection-grants`; metadata only, no credential material. `/orgs/$orgId/projects/$projectId/envs/$envId/secrets/$secretId` is the secret-in-environment detail (INS-380): version history with principal-chain actor rendering over `GET .../environments/:environmentId/secrets/:secretId/versions`; metadata only, no values. `/orgs/$orgId/people` is the read-only People register (INS-373): members and pending invitations over the same hop to the INS-373 API metadata GETs, rendering zero mutation affordances. `/orgs/$orgId/` is Home (INS-372, INS-377): a Needs You strip above a recent-activity feed. The strip and `/orgs/$orgId/approvals` poll `GET /v1/orgs/:organizationId/high-assurance-challenges` (page size = full pending list), seeded by route loaders and refreshed by client polling at 30s without navigation (ADR-0051). The inbox item model accepts both High-Assurance Challenge bounded operations (`op_`) and future Approval Requests (`req_`) by opaque ID prefix. `/orgs/$orgId/approvals/$id` is the responsive approval detail deep link (INS-381): prefix resolution (`op_` loads `GET /v1/orgs/:organizationId/high-assurance-challenges/:operationId` metadata evidence with principal chain and staleness display; `req_` renders a metadata-safe not-yet-supported state until AG6). Reject is a CSRF-protected server-fn to `POST /v1/orgs/:organizationId/high-assurance-challenges/:operationId/deny`; approve/step-up lands in the next slice. Unauthenticated visitors route through `/login?returnTo=…` and back. `/orgs/$orgId/audit` is the filterable metadata event log (INS-376): actor/project/environment/event-type/time-range filters and cursor pagination over `GET /v1/orgs/:organizationId/audit-events`, with shareable filter state in URL search params. `/onboarding` is the first-run onboarding wizard (INS-374): Guided Organization Provisioning for org-less members, with `?org&project&env` reopening the CLI handoff view; its provisioning mutation is a CSRF-checked server function forwarded to `POST /v1/onboarding/personal-organization` over the private `API` binding. Step 2 enrolls an approval passkey through `GET /auth/enroll-passkey` (AuthKit redirect/ceremony) and `GET /auth/enroll-passkey/callback` (server-verified completion); the console shell shows a dismissible-per-session nudge until a passkey exists (INS-378). URLs carry opaque Resource IDs only (docs/web-console-ux.md §URLs).

## Public Site Worker — `apps/site` (`insecur-site`)

Public marketing/legal/security surface (ADR-0078). Holds no auth session, database, keyring, API, Runtime, or product-control-plane binding.

`/install.sh` and `/install.ps1` are the CLI installer scripts, served as static text with no capability: they download the published `cli-v*` GitHub Release binaries and refuse to install anything that fails SHA-256 verification against the release's `SHA256SUMS`. Both answer GET and HEAD; other methods get 405.

`/badges/coverage.json` is a static Shields-compatible badge endpoint populated from the successful CI coverage artifact during production deploy. It exposes only aggregate unit-coverage metadata.

`/.well-known/insecur/audit-export-signing-keys.json` publishes the current and historical Ed25519 public keys used to verify audit-export signatures (ADR-0045). The document is metadata-only and carries the honest claim ceiling (`tamper-evident, independently verifiable`). Operators update it during signing-key bootstrap and rotation; private key material never appears here.

| Method | Mount prefix                                          |
| ------ | ----------------------------------------------------- |
| GET    | `/`                                                   |
| GET    | `/.well-known/insecur/audit-export-signing-keys.json` |
| GET    | `/badges/coverage.json`                               |
| GET    | `/healthz`                                            |
| GET    | `/install.ps1`                                        |
| GET    | `/install.sh`                                         |

## Runtime Worker — `apps/runtime` (`insecur-runtime`)

Sole holder of `INSTANCE_ROOT_KEY_V1`. Decrypt-egress deploy. Reached only via the private Service Binding. Zero public `/v1/*` routes; the default `fetch` handler returns 404 for any direct hit.

| Method          | Mount prefix |
| --------------- | ------------ |
| (default fetch) | `404`        |
