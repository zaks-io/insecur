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

| Method | Mount prefix                                 |
| ------ | -------------------------------------------- |
| GET    | `/healthz`                                   |
| \*     | `/v1/auth`                                   |
| \*     | `/v1/session`                                |
| \*     | `/v1/onboarding`                             |
| \*     | `/v1/instance/bootstrap`                     |
| \*     | `/v1/orgs/:organizationId/invitations`       |
| \*     | `/v1/orgs/:organizationId/organizations`     |
| \*     | `/v1/orgs/:organizationId/projects`          |
| \*     | `/v1/orgs/:organizationId/operations`        |
| \*     | `/v1/orgs/:organizationId/runtime-injection` |

## Web Worker — `apps/web` (`insecur-web`)

Browser-facing BFF (ADR-0051). Owns the human session cookie and reaches the API Worker only over
the private `API` Service Binding with a per-request `insecur-api`-audience scoped token. Holds NO
root-key binding and NO Hyperdrive binding.

| Method | Mount prefix |
| ------ | ------------ |
| GET    | `/healthz`   |
| GET    | `/`          |
| GET    | `/whoami`    |

## Runtime Worker — `apps/runtime` (`insecur-runtime`)

Sole holder of `INSTANCE_ROOT_KEY_V1`. Decrypt-egress deploy. Reached only via the private Service
Binding. Zero public `/v1/*` routes; the default `fetch` handler returns 404 for any direct hit.

| Method          | Mount prefix |
| --------------- | ------------ |
| (default fetch) | `404`        |
