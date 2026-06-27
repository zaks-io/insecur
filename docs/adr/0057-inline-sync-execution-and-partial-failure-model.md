# ADR-0057: Inline Sync Execution and Partial-Failure Model

Date: 2026-05-25

Status: Accepted

Secret sync runs execute inline, synchronously within the triggering request, rather than through Cloudflare Queues and a Durable Object serialization gate. This supersedes ADR-0012 (queue-backed sync execution) and ADR-0013 (Durable Object sync-target serialization), both deferred past V1 by the 2026-05-25 scope review. A sync run still creates an Operation record and returns an operation ID that humans, agents, and CI can poll or wait on; the work simply runs in the request that started it instead of being handed to a queue consumer. Sync Execution Revalidation still runs immediately before any provider write, unchanged from ADR-0012.

Deferring Cloudflare Queues removed the dead-letter net and deferring Durable Objects removed the concurrency gate, so the inline path owns both partial-failure handling and target serialization itself.

**Partial-failure model.** The All-Or-Nothing Sync Pre-Write Gate (CONTEXT.md) covers deterministic pre-write failure: any failing exact binding blocks every provider write before the first one starts, and the Operation ends `blocked` with zero writes. After writes begin, a provider failure on binding k of n produces an Incomplete Sync Run rather than an attempted rollback. The Operation record carries per-binding write status (`pending` → `written` | `failed{code, retryable}`). Operation states are `running`, `succeeded`, `blocked`, `incomplete`, and `canceled`. An `incomplete` Operation carries a `cause` of `retryable` (transient provider failure that backoff did not clear in-request) or `action_required` (reauthorization, provider drift, 4xx validation, boundary mismatch, value-too-large), and surfaces "N of M written, retry <op-id>" in CLI and audit. An `incomplete` Operation does not age out, matching the no-expiry stance on Approval Requests.

Transient provider failures (503, 429, network timeout, connection reset) retry in-request with backoff and honor `Retry-After`; a downstream 503 is normalized to retryable. User-actionable failures stop immediately and surface the remedy. Resume reuses the same Operation (`operations retry <op-id>`): re-claim the lease, re-run Sync Execution Revalidation, and write only the `pending` and `failed` bindings. A fresh `syncs run` against a sync that already has an open `incomplete` Operation is rejected as a conflict pointing at that operation.

**Cloudflare is exempt from per-binding partial state.** The Cloudflare adapter stages all bindings into one new Worker version and deploys once, so a Cloudflare Worker, where a secret write is a production deploy, never lands in a per-binding partial state: a staging failure leaves production untouched and is retried, and only the single deploy commits. GitHub and Vercel have no atomic multi-secret write and stay inherently per-binding. This is recorded as an amendment on ADR-0039.

**Serialization uses a lease row, not a Postgres advisory lock and not a Durable Object.** Sync Target Serialization is enforced by a lease row in the Tenant-Scoped Store keyed by (organization, provider, target identity), holding `held_by_operation_id`, `expires_at`, and a monotonic lease generation used as a fencing token. A run claims the lease in a short transaction, renews it between provider writes, releases it at the end, and may reclaim it once expired; the fencing token is checked before each provider write so a stale holder cannot write after losing the lease. Contention fails fast as a retryable `sync.target_busy` rather than blocking.

## Considered Options

- **Keep queue-backed execution (ADR-0012) plus a Durable Object gate (ADR-0013).** Rejected for V1: the 2026-05-25 scope review deferred Cloudflare Queues and Durable Objects to reduce the production spine. Both are additive add-backs (reversibility 4-5) because the Operation/audit model, per-binding status, and lease semantics defined here are exactly the execution contract a future queue consumer would honor.
- **Postgres advisory locks for serialization.** Rejected: Hyperdrive pools connections in transaction mode (ADR-0036), so a session-level advisory lock does not reliably pin to one run across the pool, and a transaction-level lock would force holding a transaction open across provider HTTP I/O. A lease row with explicit expiry and a fencing token is connection-pool-safe and survives a crashed holder.
- **Best-effort partial sync with no resumable operation.** Rejected: it leaves a Sync Target, especially a Cloudflare Worker mid-deploy, in an indeterminate production state with no operator path back. The `incomplete` Operation plus same-id resume is the path back.

## Consequences

- Neon Postgres, reached only through the Tenant-Scoped Store, remains the source of truth for Operation state, per-binding write status, the lease, and audit history. There is no dead-letter queue in V1: an exhausted or action-required failure parks as an `incomplete` Operation that a human or agent resumes by operation ID, and there is no background sweeper or cron.
- The indeterminate-production-state risk concentrates on GitHub and Vercel, which are per-binding; Cloudflare's single-deploy path removes it there.
- Each sync Operation records audit events for lease claim, Sync Execution Revalidation result, per-binding provider write summaries, retry, completion or `incomplete` or cancellation, and lease release. This mirrors ADR-0013's audit list without the enqueue and dead-letter events.
- `docs/cli-and-sync.md` and `docs/architecture.md` now describe this inline model; future implementation work should follow this ADR and those aligned area docs rather than ADR-0012/0013's deferred queue and Durable Object design.
