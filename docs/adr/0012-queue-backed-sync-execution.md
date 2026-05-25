# ADR-0012: Queue-Backed Sync Execution

Date: 2026-05-23

Status: Accepted

Secret sync runs will be queue-backed operations rather than long-running request handlers. A sync run creates an operation record, enqueues work through Cloudflare Queues, and returns an operation ID that humans, agents, and CI can poll or wait on.

Queue consumers must perform Sync Execution Revalidation immediately before decrypting Sensitive Values or writing provider-side values. The revalidation checks current Provider Account Linkage, credential scope, Connection Boundary, target resource identity, required provider protection state, exact bindings, and source version eligibility. Provider Drift is a non-retryable authorization/configuration failure for that operation until reauthorization or approved configuration change occurs.

## Consequences

Neon Postgres, reached only through the Tenant-Scoped Store, remains the source of truth for operation state and audit history. Queue consumers execute provider writes only after Sync Execution Revalidation passes, handle retryable provider failures with delayed retries, and route exhausted failures to a dead-letter path for Service Access review. Sync commands must be idempotent and resumable so agents can safely retry after network failures or Worker interruptions.
