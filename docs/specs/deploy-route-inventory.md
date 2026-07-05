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

| Method | Mount prefix                                       |
| ------ | -------------------------------------------------- |
| GET    | `/healthz`                                         |
| \*     | `/v1/auth`                                         |
| \*     | `/v1/session`                                      |
| \*     | `/v1/onboarding`                                   |
| \*     | `/v1/instance/bootstrap`                           |
| \*     | `/v1/orgs/:organizationId/invitations`             |
| \*     | `/v1/orgs/:organizationId/members`                 |
| \*     | `/v1/orgs/:organizationId/organizations`           |
| \*     | `/v1/orgs/:organizationId/projects`                |
| \*     | `/v1/orgs/:organizationId/operations`              |
| \*     | `/v1/orgs/:organizationId/runtime-injection`       |
| \*     | `/v1/orgs/:organizationId/design-partner-feedback` |

Under `/v1/orgs/:organizationId/projects` (INS-362): `GET /` lists project metadata; `GET
/:projectId/environments` lists environment metadata (including `isProtected`). `POST
/:projectId/environments/:environmentId/secrets/by-variable-key` remains the blind secret write path.

Under `/v1/session` (INS-367): `GET /whoami` echoes the verified actor; `GET /memberships` is the
console org-switcher self-read (the actor's own organizations), forwarded over the `RUNTIME` seam.

The People reads (INS-373): `GET /v1/orgs/:organizationId/members` lists membership metadata and
`GET /v1/orgs/:organizationId/invitations` lists pending-invitation metadata (identifiers, role
bundle, status, timestamps; invitations carry no token or acceptance secret). Both are
`organization:read`-gated inside the Runtime deploy.

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
`/onboarding` is the placeholder the first-run wizard will claim. URLs carry opaque Resource IDs
only (docs/web-console-ux.md §URLs).

## Public Site Worker — `apps/site` (`insecur-site`)

Public marketing/legal/security surface (ADR-0078). Holds no auth session, database, keyring, API,
Runtime, or product-control-plane binding.

| Method | Mount prefix |
| ------ | ------------ |
| GET    | `/healthz`   |
| GET    | `/`          |

## Runtime Worker — `apps/runtime` (`insecur-runtime`)

Sole holder of `INSTANCE_ROOT_KEY_V1`. Decrypt-egress deploy. Reached only via the private Service
Binding. Zero public `/v1/*` routes; the default `fetch` handler returns 404 for any direct hit.

| Method          | Mount prefix |
| --------------- | ------------ |
| (default fetch) | `404`        |
