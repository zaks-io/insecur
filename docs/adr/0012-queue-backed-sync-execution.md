# ADR-0012: Queue-Backed Sync Execution

Date: 2026-05-23

Status: Accepted

Secret sync runs will be queue-backed operations rather than long-running request handlers. A sync run creates an operation record, enqueues work through Cloudflare Queues, and returns an operation ID that humans, agents, and CI can poll or wait on.

## Consequences

D1 remains the source of truth for operation state and audit history. Queue consumers execute provider writes, handle retryable provider failures with delayed retries, and route exhausted failures to a dead-letter path for operator review. Sync commands must be idempotent and resumable so agents can safely retry after network failures or Worker interruptions.
