# ADR-0013: Durable Object Sync Target Serialization

Date: 2026-05-23

Status: Superseded by ADR-0057

> **Superseded (2026-05-25).** The 2026-05-25 scope review deferred Durable Objects past V1.
> ADR-0057 replaces the Durable Object gate with a Postgres lease row for Sync Target
> Serialization (Hyperdrive transaction-mode pooling rules out session advisory locks). The
> concurrency boundary and per-target audit intent below carry forward; the Durable Object
> primitive does not. Re-adding a Durable Object gate later is additive.

Secret sync execution will use a Durable Object execution gate per provider target, keyed by organization, provider, and target identity. Queues deliver work, the Tenant-Scoped Store records operation and audit state in Postgres, and the Durable Object prevents concurrent sync runs from racing the same Vercel project, GitHub repository/environment, or Cloudflare Worker script/binding.

## Consequences

This adds another Cloudflare primitive, but it gives the sync engine a clear concurrency boundary and a cleaner audit trail. Each sync operation should record audit events for enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release. Postgres remains the source of truth; the Durable Object is coordination, not permanent audit storage.
