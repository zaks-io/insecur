# ADR-0036: Neon Postgres Behind Hyperdrive With Row-Level Security

Date: 2026-05-24

Status: Accepted

The metadata source of truth is Neon Postgres reached through Cloudflare Hyperdrive, with Postgres Row-Level Security enforced from day one. This replaces Cloudflare D1, supersedes the datastore choice in ADR-0027 that fixed a V1 Instance as one Worker plus one D1, and revises ADR-0002, which chose D1 and explicitly kept Postgres out of the stack. The deciding reason is engine-enforced tenant isolation. D1 and SQLite have no row-level security, so under ADR-0027 the keyring (ADR-0031) was the only tenant boundary on a shared database, and the unencrypted metadata, the Opaque Resource IDs and the structure of organizations, projects, memberships, and audit rows, rested on application discipline alone. Postgres RLS adds a boundary the engine enforces on exactly that metadata, which D1 cannot provide at all. The operator chose that backstop over D1's operational minimalism.

Hyperdrive pools connections in transaction mode, and that pooling dictates how tenant scope is applied. A connection's session state resets when it returns to the pool, and a single Worker invocation may draw more than one connection, so tenant scope can never be set at the session level. It is set transaction-local, with `set_config(..., true)` at the top of each transaction, and Cloudflare warns against holding a long per-request transaction to keep session state alive because that defeats the pool. The driver is `postgres.js` with `prepare: false`, since transaction-mode pooling cannot use prepared statements, and a fresh pool is created per isolate. The persistence seam in ADR-0037 is shaped around these short scoped transactions rather than a durable session for this reason.

The Postgres connection string lives only in the Hyperdrive configuration on the Cloudflare side. It is never a Worker secret and never goes in Cloudflare Secrets Store. The Worker holds only the Hyperdrive binding, a proxy with no database credential present in the isolate. This keeps the connection secret inside the same Cloudflare account boundary that ADR-0028 and ADR-0029 already govern, and it corrects an earlier assumption that the string would be stored as an instance secret.

The encryption thesis is unchanged. The root key stays in Cloudflare Secrets Store, decryption happens only in the Worker, and Neon therefore holds ciphertext and metadata, never a plaintext Sensitive Value. RLS does not touch value protection, which remains the keyring's job (ADR-0031); it adds an engine boundary over the metadata rows the keyring never protected. The consequence is that the "keyring is the only tenant-isolation boundary" statement in ADR-0027 and ADR-0031 no longer holds: there are now two engine and crypto boundaries, RLS over the metadata and the keyring over the values. ADR-0037 details how the store drives RLS.

## Considered Options

- **Keep D1 with application-only isolation.** Rejected: it leaves the metadata boundary resting on application discipline with no engine backstop, the exact gap that prompted this change.
- **Postgres on another host.** Rejected for V1: Neon's serverless Postgres fits Cloudflare, Hyperdrive, and a bounded shared preview environment, and Neon region selection at project creation resolves the Data residency open question without a separate residency mechanism.

## Consequences

ADR-0002 is amended: Postgres is now in the stack and Neon is a subprocessor, adding one vendor to the Cloudflare-native footprint and to the subprocessor list.

ADR-0029's CD model changes. D1 migrations are replaced by Neon migrations run under an elevated database role, the runtime role is `NOBYPASSRLS`, the shared preview environment may use a Neon preview branch, and the pre-apply R2 backup now snapshots Neon. PR validation uses Docker Compose Postgres, not Neon branching. The stored Cloudflare deploy token no longer needs D1 edit; the Hyperdrive configuration holds the database credential instead.

The Data residency open question is resolved: the Neon region is fixed at project creation and chosen per residency need; revisit only for a multi-region Instance.

ADR-0027's single-D1 throughput ceiling and its `org_id` shard escape hatch no longer describe the store, since Neon scales differently. The `org_id` row model it relied on stays: ADR-0037 still filters every tenant query on `org_id`, which is also what keeps the Hyperdrive read path tenant-safe.
