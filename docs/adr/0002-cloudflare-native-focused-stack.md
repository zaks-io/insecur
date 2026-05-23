# ADR-0002: Cloudflare-Native Focused Stack

Date: 2026-05-23

Status: Accepted

insecur will be a Cloudflare-native secrets control plane: Cloudflare Workers for the API, Cloudflare D1 for metadata, WebCrypto for encryption, and R2 for encrypted backups. This keeps the operational footprint small and aligned with Isaac's stack instead of introducing long-lived Docker services, Postgres, Redis, queues, or a broad enterprise deployment model.

## Consequences

Cloudflare-native architecture keeps deployment and agent operations simple, but it means long-running work must be modeled as resumable operations because Workers can be interrupted. Rotation, sync, backup, and restore flows need operation IDs, idempotency, and retry-safe state transitions.
