# ADR-0012: Queue-Backed Sync Execution

Date: 2026-05-23

Status: Superseded by ADR-0057

> **Superseded (2026-05-25).** The 2026-05-25 scope review deferred Cloudflare Queues past V1.
> ADR-0057 replaces queue-backed execution with Inline Sync Execution. The Operation record,
> Sync Execution Revalidation timing, and idempotent/resumable requirement below carry forward;
> the enqueue, queue-consumer, and dead-letter mechanics do not. Re-adding queues later is
> additive behind the same Operation/audit contract.

Secret sync runs will be queue-backed operations rather than long-running request handlers. A sync run creates an operation record, enqueues work through Cloudflare Queues, and returns an operation ID that humans, agents, and CI can poll or wait on.

Queue consumers must perform Sync Execution Revalidation immediately before decrypting Sensitive Values or writing provider-side values. The revalidation checks current Provider Account Linkage, credential scope, Connection Boundary, target resource identity, required provider protection state, exact bindings, and source version eligibility. Provider Drift is a non-retryable authorization/configuration failure for that operation until reauthorization or approved configuration change occurs.

## Consequences

Neon Postgres, reached only through the Tenant-Scoped Store, remains the source of truth for operation state and audit history. Queue consumers execute provider writes only after Sync Execution Revalidation passes, handle retryable provider failures with delayed retries, and route exhausted failures to a dead-letter path for Service Access review. Sync commands must be idempotent and resumable so agents can safely retry after network failures or Worker interruptions.
