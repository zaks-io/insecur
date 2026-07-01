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

| Route                                        | IP binding                  | Actor binding               | Notes                                       |
| -------------------------------------------- | --------------------------- | --------------------------- | ------------------------------------------- |
| `POST /v1/onboarding/personal-organization`  | `ONBOARDING_IP` — 30/min    | `ONBOARDING_ACTOR` — 10/min | Authenticated user actor                    |
| `POST /v1/instance/bootstrap/operator-claim` | `BOOTSTRAP_IP` — 10/min     | `BOOTSTRAP_ACTOR` — 5/min   | Brute-force protection for bootstrap secret |
| `POST /v1/auth/cli/pkce/exchange`            | `AUTH_EXCHANGE_IP` — 20/min | —                           | Unauthenticated; per-IP only                |

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

## Deploy bindings

Production (`insecur-api`) and preview (`insecur-api-preview` via `env.preview`) both declare the
same binding names and limits in `apps/api/wrangler.jsonc`. Preview uses **distinct namespace IDs**
so counters do not share state with production.

| Binding            | Production namespace | Preview namespace |
| ------------------ | -------------------- | ----------------- |
| `ONBOARDING_IP`    | 2781                 | 2871              |
| `ONBOARDING_ACTOR` | 2782                 | 2872              |
| `BOOTSTRAP_IP`     | 2784                 | 2874              |
| `BOOTSTRAP_ACTOR`  | 2785                 | 2875              |
| `AUTH_EXCHANGE_IP` | 2786                 | 2876              |

The deploy-topology conformance gate (`pnpm conformance:topology`) asserts both scopes declare every
binding with matching limits and non-colliding namespace IDs.

## Local development and tests

Vitest and `wrangler dev` without deployed ratelimit bindings treat missing bindings as **pass-through**
(unlimited). Production and preview deploys must declare the bindings in `wrangler.jsonc`.
