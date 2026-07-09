---
title: API overview
description: Orientation to the insecur public API: base URL, envelopes, errors, and route groups.
section: Reference
order: 2
---

# API overview

The public API base is `https://api.insecur.cloud`. All product routes live under `/v1`.

The CLI is the supported client. This page documents the API surface for orientation, not as a stable public contract. It is pre-1.0 and may change.

## Conventions

- Organization-scoped routes are `/v1/orgs/:organizationId/...`.
- All ids are opaque resource ids, never names.
- Responses are metadata-only envelopes.
- Success looks like `{ "ok": true, "data": ..., "meta": ... }`.
- Failures use RFC 9457-style bodies with a stable `code`, a `retryable` flag, a `type` URI of the form `https://insecur.dev/errors/<code-with-hyphens>`, and often machine-readable remediation.

Secret values never appear in any response body. The one delivery path is grant consumption inside the private Runtime deploy. Short-lived CLI credentials are returned only in a response header, never a body.

## Authentication

The API is reached with short-lived CLI session credentials sent in a request header. Browser sessions live in the web console BFF, not on the public API.

## Success envelope

```json
{
  "ok": true,
  "data": { "id": "prj_3c4", "environments": ["env_5d6"] },
  "meta": { "requestId": "req_9f0" }
}
```

## Error body

```json
{
  "type": "https://insecur.dev/errors/auth-high-assurance-required",
  "code": "auth.high_assurance_required",
  "retryable": false,
  "detail": "This action requires a human step-up.",
  "operationId": "op_4f2"
}
```

## Route groups

Documented at the group level only.

| Method(s) | Prefix                                                                                             | Purpose                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/healthz`                                                                                         | Liveness.                                                                                                                                                                 |
| Various   | `/v1/auth`                                                                                         | CLI login flows: AuthKit PKCE authorize and exchange, device authorization.                                                                                               |
| Various   | `/v1/session`                                                                                      | whoami, agent derive and register, memberships, revoke.                                                                                                                   |
| Various   | `/v1/instance/bootstrap`                                                                           | Instance bootstrap status and operator claim.                                                                                                                             |
| POST      | `/v1/onboarding`                                                                                   | Guided personal organization provisioning.                                                                                                                                |
| Various   | `/v1/orgs/:organizationId/projects`                                                                | Projects, environments, secrets matrix metadata, per-secret version metadata, blind secret write by variable key, possession check, machine identities, injection grants. |
| POST      | `/v1/orgs/:organizationId/runtime-injection`                                                       | Issue runtime injection grants.                                                                                                                                           |
| Various   | `/v1/orgs/:organizationId/run-policies`                                                            | Runtime injection policies: create, show, disable.                                                                                                                        |
| Various   | `/v1/orgs/:organizationId/connections`                                                             | App connections: list, create, status, reauth, rotate, disconnect.                                                                                                        |
| Various   | `/v1/orgs/:organizationId/approval-requests`, `/v1/orgs/:organizationId/high-assurance-challenges` | Approvals and human step-up.                                                                                                                                              |
| GET       | `/v1/orgs/:organizationId/audit-events`, `/v1/orgs/:organizationId/audit-export`                   | Audit feed and signed export.                                                                                                                                             |
| Various   | `/v1/orgs/:organizationId/operations`                                                              | Long-running operation state: get, wait, cancel.                                                                                                                          |
| Various   | `/v1/orgs/:organizationId/webhook-subscriptions`                                                   | Webhook subscription management.                                                                                                                                          |
| Various   | `/v1/orgs/:organizationId/members`, `/v1/orgs/:organizationId/invitations`                         | Membership metadata.                                                                                                                                                      |
| GET       | `/v1/orgs/:organizationId/first-value-usage`                                                       | Onboarding usage counters.                                                                                                                                                |

## Errors and exit codes

The CLI maps API error codes to process exit codes. See the errors reference for the code catalog and the exit-codes reference for how those map to CLI exit status.

## Related

- [Errors](/docs/reference/errors)
- [Exit codes](/docs/reference/exit-codes)
- [Environment variables](/docs/reference/environment-variables)
- [Audit and verification](/docs/audit)
