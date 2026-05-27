# Unit Economics

Last updated: 2026-05-26. Status: **rough model v0.** Companion to
[pricing-strategy.md](pricing-strategy.md).

This is a planning model, not a finance forecast. It exists to answer whether the proposed
`$25/seat/month` Team price can support the documented product shape, and what limits are needed
when machines, sync runs, and Runtime Injection are intentionally not billed as seats.

## Executive Summary

- The proposed `$25/seat/month` price is not constrained by normal infrastructure COGS. Expected
  product infra per active paid seat is likely below `$1/month`; payment processing is the larger
  direct per-seat cost at roughly `$0.90-$1.20/seat/month`, depending on monthly vs annual billing
  and invoice size.
- Normal Team usage should land around **94-97% gross margin before support**, once the shared
  Hosted Instance platform floor is amortized across a modest customer base.
- The COGS risk is not normal use. It is an automation-heavy tenant, especially a low-seat or free
  tenant, generating millions of Runtime Injection, Operation polling, or Secret Sync requests.
- Keep the pricing story "robots are free" as **unmetered billing**, but implement explicit abuse
  and reliability limits. Do not sell per-operation pricing, but do enforce per-actor, per-org, and
  per-IP rate limits, concurrency limits, daily free-tier limits, and spend circuit breakers.
- A Team seat minimum or platform floor is not required by infra COGS once there is more than a
  tiny customer base. It may still be justified by support, production-custody risk, and trust
  positioning.
- Enterprise SSO/SCIM/Directory must remain sales-led or carry a clear platform floor. WorkOS SSO
  and Directory Sync are connection-priced, not seat-priced, and can exceed the revenue from a
  small self-serve account.

## Sources Checked

Prices were checked on 2026-05-26 from official vendor pages:

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): Workers
  Paid is a `$5/month` minimum, includes `10M` requests and `30M` CPU ms, then charges
  `$0.30/M` requests and `$0.02/M` CPU ms. Hyperdrive is included with paid Workers. Queues are
  `$0.40/M` standard operations after included usage. Durable Objects are `$0.15/M` requests plus
  duration/storage if used.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/): Standard storage is
  `$0.015/GB-month`; Class A operations are `$4.50/M`; Class B operations are `$0.36/M`; egress is
  free. The Standard free tier includes `10GB-month`, `1M` Class A, and `10M` Class B operations.
- [Neon pricing](https://neon.com/pricing): Launch is `$0.106/CU-hour` and `$0.35/GB-month` with
  `7-day` restore history. Scale is `$0.222/CU-hour` and `$0.35/GB-month` with larger production
  features.
- [WorkOS pricing](https://workos.com/pricing): AuthKit is free up to `1M` monthly active users,
  then `$2,500/month` per additional `1M`. SSO and Directory Sync start at `$125/connection/month`
  each. WorkOS Audit Logs event retention is `$99/M` stored events if that product is used.
- [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing): transactional
  email is free for `3,000/month`, Pro is `$20/month` for `50,000`, and overage is `$0.90/1,000`.
- [Stripe pricing](https://stripe.com/pricing): domestic cards are `2.9% + $0.30`; Stripe Billing
  pay-as-you-go is `0.7%` of billing volume.
- YC pricing guidance: Kevin Hale's
  ["Startup pricing 101"](https://www.ycombinator.com/library/6h-startup-pricing-101) argues for
  value-based pricing, understanding the cost/price/value gap, and not undercharging early-adopter
  B2B customers. That supports using COGS as a guardrail, not as the primary price setter.

## V1 Cost Drivers From The Specs

V1 Hosted Instance costs:

- Cloudflare Workers API and web BFF requests.
- Cloudflare Hyperdrive queries to Neon Postgres.
- Neon Postgres compute, storage, point-in-time history, indexes, and branch/test usage.
- R2 encrypted backups, forensic archive, and optional Logpush destination.
- Cloudflare Secrets Store for instance root key material and instance-level secrets. Separate
  published product pricing was not found; model as included/unknown until billing proves otherwise.
- WorkOS AuthKit for human identity.
- Email or notification delivery for approval alerts and account flows.
- Stripe or equivalent payment processing.

Deferred or optional V1-adjacent costs:

- Cloudflare Queues and Durable Objects are deferred past V1 by ADR-0057. Do not include them in
  V1 baseline COGS, but keep their add-back cost in the model.
- Axiom or another telemetry sink is optional and still an open vendor decision.
- Vercel sync is deferred past V1.

Not counted as product COGS here:

- Founder/developer time, support labor, SOC 2 tooling, penetration tests, legal, insurance, tax
  filing, and incident-response retainers. These matter to pricing, but they are operating expense
  or trust cost rather than per-unit product delivery COGS.

## Unit Cost Primitives

### Cloudflare Worker Request

After the included Workers Paid usage:

```text
worker_request_cost =
  requests_millions * 0.30
  + cpu_ms_millions * 0.02
```

Examples:

- `1M` requests at `10ms` CPU/request: about `$0.50`.
- `100M` requests at `7ms` CPU/request: Cloudflare's own example is `$45.40/month`, including the
  `$5` subscription.

Cloudflare does not bill Worker subrequests separately, which is important because each request can
perform several provider or Hyperdrive calls.

### Neon Postgres

Neon is the dominant real infra cost once Worker included usage is exhausted. There is no reliable
conversion from "number of API operations" to CU-hours until the implementation exists, so use this
budget range for planning:

```text
normal metadata-heavy workload:
  25-100 Neon Launch CU-hours per 1M Runtime Injection runs

cost at Launch:
  25 CU-hours * 0.106 = $2.65
  100 CU-hours * 0.106 = $10.60
```

Storage is probably not the problem. Even `1M` small audit or operation rows at roughly `1KB` each
is about `1GB` before indexes. With indexes and history, budget `3-5GB` per million durable rows:
`$1.05-$1.75/month` on Neon storage plus point-in-time history change storage. The bigger risk is
bad query shape, not bytes at rest.

### Runtime Injection

Planning assumption for one Runtime Injection run:

- 2 Worker requests: issue/fetch plus consume/status path.
- 25-100 total Worker CPU ms across auth, access checks, envelope decrypt, grant state, and audit.
- 20-60 Postgres statements until optimized.
- No stdout/stderr capture and no local value persistence, per the specs.

Estimated marginal cost per `1M` Runtime Injection runs after included usage:

| Assumption                                      | Cloudflare |     Neon |    Total |
| ----------------------------------------------- | ---------: | -------: | -------: |
| Low: `25ms` Worker CPU/run, `25` CU-hours DB    |    `$1.10` |  `$2.65` |  `$3.75` |
| Mid: `50ms` Worker CPU/run, `50` CU-hours DB    |    `$1.60` |  `$5.30` |  `$6.90` |
| High: `100ms` Worker CPU/run, `100` CU-hours DB |    `$2.60` | `$10.60` | `$13.20` |

This says paid automation can be unmetered for normal use. It also says abuse can be cheap enough
to miss until it is not: a botnet or runaway agent can multiply this quickly, and database
contention can cause reliability harm before the bill is material.

### Secret Sync

Planning assumption for one Secret Sync run with `N` exact bindings:

- 1 start request and operation record.
- Sync Execution Revalidation.
- Lease claim/renew/release in Postgres.
- `N` decrypts and `N` provider writes for GitHub; Cloudflare stages all bindings then deploys once.
- Per-binding progress/audit rows.

Provider API calls themselves do not appear to create direct insecur COGS. The cost is Worker CPU,
Postgres work, audit rows, provider latency, and retry pressure. Worker wall-clock wait for provider
HTTP is not a duration charge under Workers Standard, but request time limits and provider rate
limits still matter.

Budget until measured:

```text
1M sync binding writes/month:
  $5-$30 product infra COGS, assuming sane DB queries and no pathological retries
```

The operational risk is partial failure, provider rate limiting, and accidental production deploy
impact, not raw Cloudflare cost.

### Secret Storage, Audit, And Backups

V1 caps Sensitive Values at `64KiB`, but average values should be much smaller. Assume:

- Average encrypted secret version payload: `1-4KB`.
- Average operation/audit row with indexes and history: `1-5KB`.
- Daily encrypted R2 logical exports and forensic archive grow with metadata volume.

At these sizes, storage is a rounding error for normal small teams:

- `10GB` R2 Standard storage is inside the free tier.
- Beyond the free tier, R2 Standard storage is `$0.015/GB-month`.
- R2 Class A writes matter only for high-object-count backup designs; compact daily exports keep
  this small.

### WorkOS

AuthKit is effectively free at the scale relevant to this model because the first `1M` monthly
active users are free. That means WorkOS aligns well with the per-human-seat axis for Team.

Do not include enterprise identity in Team:

- SSO: `$125/connection/month` for the first 15 connections.
- Directory Sync: another `$125/connection/month` for the first 15 connections.

An enterprise customer needing both can add `$250/month` of WorkOS pass-through before support,
SLA, DPA, or compliance labor. That belongs in Enterprise pricing.

### Email

Approval notifications and account emails should be cheap at V1 scale:

- Resend Free: `3,000/month`, `100/day`.
- Resend Pro: `$20/month` for `50,000`.
- Overage: `$0.90/1,000`.

Email is a shared platform floor until volume is meaningful.

### Payment Processing

For self-serve monthly card billing with Stripe Payments and Stripe Billing:

```text
payment_cogs = invoice_amount * 2.9% + $0.30 + invoice_amount * 0.7%
```

Effective fee per paid seat:

| Seats on one monthly invoice | Revenue |     Fee | Fee / seat |
| ---------------------------: | ------: | ------: | ---------: |
|                            1 |   `$25` | `$1.20` |    `$1.20` |
|                            2 |   `$50` | `$2.10` |    `$1.05` |
|                            3 |   `$75` | `$3.00` |    `$1.00` |
|                            5 |  `$125` | `$4.80` |    `$0.96` |
|                           10 |  `$250` | `$9.30` |    `$0.93` |

Annual billing paid up front reduces the fixed `$0.30` invoice fee and improves cash, but it only
lowers payment COGS to about `$0.90/seat/month` at these prices. Annual billing is more useful for
cash flow and commitment than for gross margin.

## Scenario Model

These scenarios exclude the shared platform floor and support. They are meant to show marginal
tenant economics once a Hosted Instance is already running.

| Scenario              | Revenue | Workload shape                                                | Product infra | Payment COGS | Total COGS | Gross margin |
| --------------------- | ------: | ------------------------------------------------------------- | ------------: | -----------: | ---------: | -----------: |
| Free active org       |    `$0` | 1 user, 1 project, 1k injections, small writes                |      `<$0.05` |         `$0` |   `<$0.05` |          n/a |
| Team expected         |  `$125` | 5 seats, 10k injections, light sync, normal UI/API            |    `$0.10-$1` |      `$4.80` |    `$5-$6` |     `95-96%` |
| Team automation-heavy |  `$250` | 10 seats, about 1M injection-equivalent runs plus sync        |      `$5-$20` |      `$9.30` |  `$14-$30` |     `88-94%` |
| Automation whale      |  `$625` | 25 seats, about 10M injection-equivalent runs plus heavy sync |    `$50-$150` |     `$22.80` | `$73-$173` |     `72-88%` |

Interpretation:

- The proposed Team price has room for generous automation.
- A 5-seat Team account can absorb normal usage easily.
- A 1-seat Team account doing automation-whale volume is the pathological case. It is not a
  pricing problem to solve with per-operation billing; it is a fair-use and rate-limit problem.
- Free active orgs are cheap one by one, but broad public signup without quotas turns the free tier
  into an unbounded denial-of-wallet surface.

## Shared Platform Floor

The Hosted Instance has a fixed monthly cost before the first paid seat:

| Layer                   |                           Lean V1 production floor |                       More conservative floor |
| ----------------------- | -------------------------------------------------: | --------------------------------------------: |
| Cloudflare Workers Paid |                                               `$5` |                                          `$5` |
| Neon                    | `$15-$30` Launch, kept warm enough for low traffic | `$150-$200` Scale or always-on larger compute |
| Resend                  |                                           `$0-$20` |                                         `$20` |
| R2 / logs / misc        |                                           `$1-$10` |                                     `$10-$30` |
| WorkOS custom domain    |                                               `$0` |                                 `$99` if used |
| **Total**               |                                **`$25-$65/month`** |                         **`$285-$355/month`** |

This is platform-wide, not per tenant. It matters early and becomes negligible once there are a few
dozen paid seats.

Break-even before support:

- Lean floor: `2-3` paid seats covers the platform floor and payment fees.
- Conservative floor: `13-16` paid seats covers the platform floor and payment fees.

This is why a Team platform floor is not required by COGS at scale, but the earliest production
period may still need founder-funded overhead, annual prepay, or a small minimum if the product is
positioned as production custody from day one.

## Free Tier Cost Ceiling

The current pricing doc says Free is dev-only and caps Organizations, Projects, and Members, but
does not yet define rate limits. That is the main open financial risk.

Recommended Free defaults before broad public signup:

| Dimension                   |                               Proposed Free default | Reason                                           |
| --------------------------- | --------------------------------------------------: | ------------------------------------------------ |
| Runtime Injection runs      |                 `1,000/day/org`, `10,000/month/org` | Enough for real dev use; blocks runaway agents.  |
| API requests                | `10,000/day/org`, with lower unauthenticated limits | Keeps aggregate free traffic bounded.            |
| Secret writes/imported keys |                    `100/day/org`, `1,000/month/org` | Prevents storage/audit spam.                     |
| Operation polling           |       Exponential backoff required; cap tight loops | Agents can accidentally poll too fast.           |
| Concurrent operations       |                                             `3/org` | Prevents sync/import storms.                     |
| Stored secret versions      |                  `10,000/org` or storage equivalent | Keeps abandoned free tenants bounded.            |
| Audit retention             |                                   Existing `7 days` | Storage control and tier distinction.            |
| Provider sync               |  Development-only, low default daily cap if enabled | Free should not become a production sync worker. |

These should be enforced as `Instance Configuration` and `Organization Configuration` limits, with
stable `rate_limited` and retry metadata. They are abuse and reliability controls, not billable
usage meters.

## Paid Team Rate Limits

Team should remain "robots are free" in billing. The implementation still needs safety limits:

- Per-actor and per-machine request-rate limits.
- Per-Organization concurrency limits for sync/import/promotion/runtime operations.
- Per-target Secret Sync serialization, already specified through lease rows.
- Operation polling backoff and server-provided `retry_after`.
- Daily spend/cost circuit breakers based on Worker requests, CPU, Neon CU-hours, and DB errors.
- A fair-use review threshold, not a customer-visible usage meter.

Suggested first Team thresholds:

| Dimension              |                                    Default Team threshold | Behavior                                           |
| ---------------------- | --------------------------------------------------------: | -------------------------------------------------- |
| Runtime Injection runs | `100,000/seat/month`, pooled, minimum `250,000/org/month` | Alert internally; do not hard-block immediately.   |
| API requests           |           `1M/seat/month`, pooled, minimum `2M/org/month` | Alert, then rate-limit if abusive.                 |
| Sync binding writes    |   `10,000/seat/month`, pooled, minimum `25,000/org/month` | Alert; high values often mean bad workflow design. |
| Concurrent operations  |                                        `10/org`, raisable | Protects reliability.                              |
| Operation polling      |                             Backoff after first few polls | Protects DB.                                       |

The public copy should say "unmetered automation subject to abuse and fair-use limits." Avoid the
word "unlimited" in contracts unless the AUP gives enough room to throttle abusive workloads.

## Pricing Implications

1. Keep `$25/seat/month` as a value-based trust price. The model supports it; COGS does not require
   charging per machine or per operation.
2. Keep Free dev-only, but add hard quotas before broad public signup. Free-tier abuse is the only
   credible infra COGS problem in the current architecture.
3. Do not add usage billing for Runtime Injection or sync runs. It weakens the product story and is
   not necessary for margin.
4. Add internal cost telemetry by Organization from day one: Worker request count, Worker CPU ms,
   Neon query count/latency estimate, operation count, injection count, sync binding writes, audit
   row growth, R2 export size, and email sends.
5. Treat Enterprise identity as a pass-through-plus-margin feature. SSO and Directory Sync should
   trigger Enterprise pricing with a floor that covers WorkOS connection cost, support, SLA, DPA,
   and compliance review.
6. Annual billing should be offered for commitment and cash, not because it materially changes COGS.
7. A Team platform floor is optional. If used, justify it as production custody/support positioning,
   not as raw infra cost recovery.

## Open Items

- Measure actual Worker CPU ms and Neon CU-hours once First Value Runtime Injection exists.
- Decide whether public pricing says "unmetered" instead of "unlimited" for automation.
- Decide whether solo production custody stays `$25/month` or gets a small platform minimum.
- Pick the email provider and telemetry sink; update this model when those are decided.
- Model support COGS separately after the first design partners reveal actual ticket volume.
- Model BYOC / Self-Hosted Instance separately: customer-paid infrastructure changes COGS into
  licensing, update, and support economics.
