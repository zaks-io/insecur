# ADR-0013: Durable Object Sync Target Serialization

Date: 2026-05-23

Status: Accepted

Secret sync execution will use a Durable Object execution gate per provider target, keyed by organization, provider, and target identity. Queues deliver work, D1 records operation and audit state, and the Durable Object prevents concurrent sync runs from racing the same Vercel project, GitHub repository/environment, or Cloudflare Worker.

## Consequences

This adds another Cloudflare primitive, but it gives the sync engine a clear concurrency boundary and a cleaner audit trail. Each sync operation should record audit events for enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release. D1 remains the source of truth; the Durable Object is coordination, not permanent audit storage.
