# Public-edge abuse controls (INS-278)

Pre-tenant public routes on the API Worker are rate-limited with **Cloudflare Workers Rate
Limiting bindings** (`ratelimits` in `apps/api/wrangler.jsonc`). Limiter state is **not** stored in
Workers KV.

## Venue

| Control                      | Mechanism                                          | Config                    |
| ---------------------------- | -------------------------------------------------- | ------------------------- |
| Per-IP / per-actor throttles | Cloudflare `ratelimit` bindings on `@insecur/api`  | `apps/api/wrangler.jsonc` |
| Denied audit on throttle     | Runtime RPC `recordAbuseDenied` → `@insecur/audit` | `apps/runtime`            |
| Stable client error          | `abuse.rate_limited` → HTTP `429`, CLI exit `8`    | `docs/cli-and-sync.md`    |

Limits are **per Cloudflare location** (eventually consistent within a PoP). This matches the
Workers Rate Limiting product semantics documented by Cloudflare.

## Routes and limits

All windows use a **60 second** period (Cloudflare binding constraint).

| Route                                        | IP binding                  | Actor binding                    | Notes                                       |
| -------------------------------------------- | --------------------------- | -------------------------------- | ------------------------------------------- |
| `POST /v1/onboarding/personal-organization`  | `ONBOARDING_IP` — 30/min    | `ONBOARDING_ACTOR` — 10/min      | Authenticated user actor                    |
| same                                         | —                           | `PERSONAL_ORG_ACTOR` — **3/min** | Personal-org creation cap per user          |
| `POST /v1/instance/bootstrap/operator-claim` | `BOOTSTRAP_IP` — 10/min     | `BOOTSTRAP_ACTOR` — 5/min        | Brute-force protection for bootstrap secret |
| `POST /v1/auth/cli/pkce/exchange`            | `AUTH_EXCHANGE_IP` — 20/min | —                                | Unauthenticated; per-IP only                |

Limiter keys are prefixed (`ip:…`, `actor:…`) inside each binding namespace so counters do not
collide across routes.

## Denied audit events

When a limit is exceeded, the API returns `abuse.rate_limited` and forwards a best-effort denied
audit to the Runtime Worker:

| Edge                     | Audit event code                                  |
| ------------------------ | ------------------------------------------------- |
| Guided provisioning      | `onboarding.guided_organization_provision_denied` |
| Bootstrap operator claim | `bootstrap.operator_claim_denied`                 |
| CLI PKCE exchange        | `auth.cli_pkce_exchange_denied`                   |

Each denied event stores `denial.reasonCode = abuse.rate_limited`.

## Local development and tests

Vitest and `wrangler dev` without deployed ratelimit bindings treat missing bindings as **pass-through**
(unlimited). Production/preview deploys must declare the bindings in `wrangler.jsonc`.
