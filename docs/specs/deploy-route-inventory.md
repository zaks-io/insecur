# Deploy route inventory (owner doc)

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

Public edge. Authenticates humans/agents, forwards keyring-bound work AND all non-keyring DB work
(admission, onboarding, membership, operations, grant issue, bootstrap) to the Runtime Worker over
the `RUNTIME` Service Binding. Holds NO root-key binding and NO Hyperdrive binding; performs zero DB
I/O.

| Method | Mount prefix                                         |
| ------ | ---------------------------------------------------- |
| GET    | `/healthz`                                           |
| \*     | `/v1/auth`                                           |
| \*     | `/v1/session`                                        |
| \*     | `/v1/onboarding`                                     |
| \*     | `/v1/instance/bootstrap`                             |
| \*     | `/v1/orgs/:organizationId/invitations`               |
| \*     | `/v1/orgs/:organizationId/members`                   |
| \*     | `/v1/orgs/:organizationId/organizations`             |
| \*     | `/v1/orgs/:organizationId/projects`                  |
| \*     | `/v1/orgs/:organizationId/audit-events`              |
| \*     | `/v1/orgs/:organizationId/operations`                |
| \*     | `/v1/orgs/:organizationId/high-assurance-challenges` |
| \*     | `/v1/orgs/:organizationId/runtime-injection`         |
| \*     | `/v1/orgs/:organizationId/design-partner-feedback`   |

Under `/v1/orgs/:organizationId/projects` (INS-362): `GET /` lists project metadata; `POST /`
creates a project with a client-minted opaque ID and Display Name; `GET
/:projectId/environments` lists environment metadata (including `isProtected`); `POST
/:projectId/environments` creates a non-protected development environment (optional Secret Shape
copy from another environment in the same project); `GET
/:projectId/secrets` lists the secrets × environments matrix metadata (presence, version,
last-set actor/time; INS-363). `POST
/:projectId/environments/:environmentId/secrets/by-variable-key` remains the blind secret write path.

Under `/v1/orgs/:organizationId/audit-events` (INS-364): `GET /` lists tenant-qualified audit
events with metadata-only envelopes. Query filters: `actorUserId`, `actorMachineIdentityId`,
`projectId`, `environmentId`, `eventCode`, `createdAtFrom`, `createdAtTo`, plus cursor pagination
via `cursor` and bounded `pageSize`. Authorize-then-read requires `metadata:detail_read` inside the
Runtime deploy.

Under `/v1/session` (INS-367): `GET /whoami` echoes the verified actor; `GET /memberships` is the
console org-switcher self-read (the actor's own organizations), forwarded over the `RUNTIME` seam.
`POST /revoke` ends the calling actor's own CLI session (INS-436), forwarded over the `RUNTIME` seam;
unauthenticated callers receive a metadata-only success no-op.

The People reads (INS-373): `GET /v1/orgs/:organizationId/members` lists membership metadata and
`GET /v1/orgs/:organizationId/invitations` lists pending-invitation metadata (identifiers, role
bundle, status, timestamps; invitations carry no token or acceptance secret). Both are
`organization:read`-gated inside the Runtime deploy.

Under `/v1/orgs/:organizationId/high-assurance-challenges` (INS-361): `GET /` lists pending
High-Assurance Challenge metadata for the Human Approval Surface; `GET /:operationId` returns one
challenge's metadata evidence; `POST /:operationId/clear` clears with operation-bound fresh step-up
evidence (`stepUpCode` and `stepUpCodeVerifier` in body, exchanged server-side via WorkOS/AuthKit for the
same user/session); `POST
/:operationId/deny` denies the bounded operation. All four are human-actor-only (`requireUserActor`)
and authorize inside the Runtime deploy (`approval:approve` for clear, `approval:reject` for deny,
either approval scope for list/get after `organization:read`).

## Web Worker — `apps/web` (`insecur-web`)

Browser-facing BFF (ADR-0051). Owns the human session cookie and reaches the API Worker only over
the private `API` Service Binding with a per-request `insecur-api`-audience scoped token. Holds NO
root-key binding and NO Hyperdrive binding.

| Method | Mount prefix                                |
| ------ | ------------------------------------------- |
| GET    | `/healthz`                                  |
| GET    | `/`                                         |
| GET    | `/login`                                    |
| GET    | `/auth/callback`                            |
| GET    | `/auth/enroll-passkey`                      |
| GET    | `/auth/enroll-passkey/callback`             |
| POST   | `/logout`                                   |
| GET    | `/whoami`                                   |
| GET    | `/onboarding`                               |
| GET    | `/orgs/`                                    |
| GET    | `/orgs/$orgId`                              |
| GET    | `/orgs/$orgId/`                             |
| GET    | `/orgs/$orgId/projects/`                    |
| GET    | `/orgs/$orgId/projects/$projectId`          |
| GET    | `/orgs/$orgId/projects/$projectId/`         |
| GET    | `/orgs/$orgId/projects/$projectId/secrets`  |
| GET    | `/orgs/$orgId/projects/$projectId/access`   |
| GET    | `/orgs/$orgId/projects/$projectId/delivery` |
| GET    | `/orgs/$orgId/audit`                        |
| GET    | `/orgs/$orgId/people`                       |
| GET    | `/orgs/$orgId/settings`                     |

The `/orgs/*` rows are the authed console shell (INS-367): `/orgs/` resolves the default
organization, `/orgs/$orgId` is the org-scoped layout carrying the five-section sidebar, and the
section rows are TanStack file routes rendered inside it (`$orgId` is TanStack path-param syntax).
The `/orgs/$orgId/projects/*` rows are the Projects section (INS-370): the project list, the
project layout with its Environments (`/$projectId/`, the index) / Secrets / Access / Delivery
views; all reads go through the BFF scoped-token hop to the INS-362 API metadata GETs.
`/orgs/$orgId/people` is the read-only People register (INS-373): members and pending invitations
over the same hop to the INS-373 API metadata GETs, rendering zero mutation affordances.
`/orgs/$orgId/` is Home (INS-372): a Needs You placeholder above a recent-activity feed over
`GET /v1/orgs/:organizationId/audit-events` (page size 10), seeded by the route loader and refreshed
by client polling at 30s without navigation (ADR-0051).
`/onboarding` is the first-run onboarding wizard (INS-374): Guided Organization Provisioning for
org-less members, with `?org&project&env` reopening the CLI handoff view; its provisioning
mutation is a CSRF-checked server function forwarded to `POST /v1/onboarding/personal-organization`
over the private `API` binding. Step 2 enrolls an approval passkey through `GET /auth/enroll-passkey`
(AuthKit redirect/ceremony) and `GET /auth/enroll-passkey/callback` (server-verified completion);
the console shell shows a dismissible-per-session nudge until a passkey exists (INS-378). URLs carry opaque Resource IDs only (docs/web-console-ux.md §URLs).

## Public Site Worker — `apps/site` (`insecur-site`)

Public marketing/legal/security surface (ADR-0078). Holds no auth session, database, keyring, API,
Runtime, or product-control-plane binding.

`/install.sh` and `/install.ps1` are the CLI installer scripts, served as static text with no
capability: they download the published `cli-v*` GitHub Release binaries and refuse to install
anything that fails SHA-256 verification against the release's `SHA256SUMS`. Both answer GET and
HEAD; other methods get 405.

`/badges/coverage.json` is a static Shields-compatible badge endpoint populated from the successful
CI coverage artifact during production deploy. It exposes only aggregate unit-coverage metadata.

| Method | Mount prefix            |
| ------ | ----------------------- |
| GET    | `/healthz`              |
| GET    | `/`                     |
| GET    | `/badges/coverage.json` |
| GET    | `/install.sh`           |
| GET    | `/install.ps1`          |

## Runtime Worker — `apps/runtime` (`insecur-runtime`)

Sole holder of `INSTANCE_ROOT_KEY_V1`. Decrypt-egress deploy. Reached only via the private Service
Binding. Zero public `/v1/*` routes; the default `fetch` handler returns 404 for any direct hit.

| Method          | Mount prefix |
| --------------- | ------------ |
| (default fetch) | `404`        |
