# Unit Economics (TODO)

Last updated: 2026-05-25. Status: **not modeled.** Companion to
[pricing-strategy.md](pricing-strategy.md).

The $25/seat price is a working assumption with no cost basis behind it yet. This doc must model
gross margin per paid seat and the cost ceiling of the Free tier before the price is defended.
The structural risk: the price is per human seat, but most variable cost is driven by automation
(machines, sync runs, runtime injections) that the product deliberately does not meter.

## Cost drivers to model

- **WorkOS** (Human Identity binding): per monthly active user, plus enterprise SSO connection
  fees. Scales with humans, the same axis we bill, so this one is at least aligned.
- **Cloudflare**: Workers requests, Durable Objects (sync serialization), Queues (sync
  execution), Hyperdrive, Secrets Store, R2 (backups). Scales with automation volume, which is
  not billed.
- **Neon** (Metadata Store binding): compute + storage, per active org and usage.
- **Email / notification** delivery.
- **Support**.

## Models to build

- Gross margin per Team seat at $25/mo, given a realistic automation volume per seat.
- Free-tier cost per active org (unlimited machines / sync / injection, zero revenue): the
  worst-case cost ceiling and the abuse bound.
- Break-even seats per org; sensitivity to automation-heavy tenants.
- Confirm the seat price covers expected automation per seat, since "robots are free" but robots
  drive most variable cost.

## Open

- Does Team need a seat minimum or platform floor to cover base infra per org?
- BYOC / self-host shifts infra cost to the customer; pricing there is licensing and must be
  modeled separately.
