# ADR-0027: Shared-Instance Topology And Binding Map

Date: 2026-05-24

Status: Accepted

A V1 Instance is one Cloudflare Worker plus one D1 database. Every customer is an Organization inside that single Instance, and tenant isolation is logical: every tenant-owned row carries `org_id` directly or is reachable only through an organization-owned parent, as the Tenancy model already requires. There is no per-Organization database and no per-customer Worker. This makes the concrete deployment shape behind ADR-0001 (tenant-first control plane) and ADR-0020 (instance posture) explicit, since neither pinned it.

The Cloudflare binding map for the Instance is fixed:

- **D1**: the source of truth, and the home for durable ephemeral state (sessions and revocation rows, operation state, idempotency keys, any rate-limit counters).
- **Durable Objects**: only where atomic single-use or serialization is required, namely the per-target sync execution gate (ADR-0013), one-use Injection Grant consumption, and the single-pending-Approval-Request-per-Protected-Environment invariant (ADR-0025).
- **Queues**: sync execution (ADR-0012).
- **R2**: encrypted backups.
- **Cloudflare Secrets Store**: instance key material and other instance-level secrets (ADR-0028).

Workers KV is deliberately excluded. Its eventual consistency is a hazard for security-relevant checks such as session revocation, and D1 plus Durable Objects already cover every job KV would have served.

## Considered Options

- **D1-per-Organization** for physical blast-radius isolation. Rejected: it contradicts the `org_id` row model and the cross-tenant regression tests, and complicates joins, migrations, the key hierarchy, and the audit store.
- **Instance-per-customer** (separate Worker + bindings per customer). Rejected: heavy operational overhead for Small-Group Production and it defeats the shared Hosted model and Bounded Onboarding.

## Consequences

Because physical database separation is rejected, the key hierarchy (ADR-0005, ADR-0026) is the only tenant-isolation boundary, so its correctness and the cross-tenant authorization regression tests are load-bearing. The single-D1 throughput ceiling is acceptable for Small-Group Production write volume; if it is ever reached, the escape hatch is sharding by `org_id`, which the row model already permits. KV's removal also drops it from the "never store plaintext" durable-surface enumeration in `architecture.md`.
