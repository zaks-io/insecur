# ADR-0027: Shared-Instance Topology And Binding Map

Date: 2026-05-24

Status: Accepted, amended by [ADR-0036](0036-neon-postgres-over-hyperdrive-with-rls.md), [ADR-0037](0037-tenant-scoped-bound-store-over-rls.md), [ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md), and [ADR-0077](0077-capability-isolated-worker-deploys.md)

> **Amendment note (ADR-0077):** "one Cloudflare Worker" below is a _data-plane_ statement — one
> shared Instance, no per-Organization database, no per-customer Worker. It does **not** mean a single
> monolithic deploy. The control plane is split into capability-isolated Worker deploys (API, Runtime,
> Web; Service Access deferred) per [ADR-0051](0051-web-console-architecture.md) and ADR-0077, with the
> root key isolated to the Runtime deploy. See `docs/specs/product-spec.md` §2 for the normative
> topology and invariant.

A V1 Instance is one Cloudflare Worker plus one Hyperdrive-backed Neon Postgres database. Every customer is an Organization inside that single Instance, and tenant isolation is logical plus engine-enforced: every tenant-owned row carries `org_id` directly or is reachable only through an organization-owned parent, and Postgres Row-Level Security backs the application filter. There is no per-Organization database and no per-customer Worker. This makes the concrete deployment shape behind ADR-0001 (tenant-first control plane) and ADR-0020 (instance posture) explicit, since neither pinned it.

The Cloudflare binding map for the Instance is fixed:

- **Hyperdrive-backed Neon Postgres**: the source of truth, and the home for durable ephemeral state (sessions and revocation rows, operation state, idempotency keys, any rate-limit counters).
- **Queues and Durable Objects**: deferred past V1 (ADR-0057). The three concerns they would have served now resolve in Postgres through the Tenant-Scoped Store: Sync Target Serialization is a lease row with a fencing token (ADR-0057); one-use Injection Grant consumption is a compare-and-set (`UPDATE ... WHERE status = 'issued'`, zero rows affected means already consumed, fail closed); and the single-pending-Approval-Request-per-Protected-Environment invariant (ADR-0025) is a partial unique index (`WHERE status = 'pending'`) with compare-and-set supersession in one transaction. Re-adding either Cloudflare primitive later is additive.
- **R2**: encrypted backups.
- **Cloudflare Secrets Store**: instance key material and other instance-level secrets (ADR-0028).

Workers KV is deliberately excluded. Its eventual consistency is a hazard for security-relevant checks such as session revocation, and Postgres alone covers every job KV would have served.

## Considered Options

- **D1-per-Organization** for physical blast-radius isolation. Rejected: it contradicts the `org_id` row model and the cross-tenant regression tests, and complicates joins, migrations, the key hierarchy, and the audit store.
- **Instance-per-customer** (separate Worker + bindings per customer). Rejected: heavy operational overhead for Small-Group Production and it defeats the shared Hosted model and Bounded Onboarding.

## Consequences

Because physical database separation is rejected, tenant isolation is carried by the Tenant-Scoped Store and Row-Level Security for metadata, the Effective Access Resolver for capability, and the key hierarchy (ADR-0005, ADR-0026) for Sensitive Values. Their correctness and the cross-tenant authorization regression tests are load-bearing. Neon replaces the earlier single-D1 throughput ceiling; if the shared database shape is ever insufficient, the escape hatch remains sharding by `org_id`, which the row model already permits. KV's removal also drops it from the "never store plaintext" durable-surface enumeration in `architecture.md`.
