# ADR-0002: Cloudflare-Native Focused Stack

Date: 2026-05-23

Status: Accepted, amended by [ADR-0036](0036-neon-postgres-over-hyperdrive-with-rls.md)

insecur will be a Cloudflare-native secrets control plane: Cloudflare Workers for the API, Hyperdrive-backed Neon Postgres for metadata, WebCrypto for encryption, and R2 for encrypted backups. ADR-0036 revises the original D1 datastore choice to add Postgres Row-Level Security as an engine backstop for tenant metadata isolation. The stack still avoids long-lived Docker services, self-managed databases, Redis, or a broad enterprise deployment model.

## Consequences

Cloudflare-native architecture keeps deployment and agent operations simple, but it means long-running work must be modeled as resumable operations because Workers can be interrupted. Rotation, sync, backup, and restore flows need operation IDs, idempotency, and retry-safe state transitions.
