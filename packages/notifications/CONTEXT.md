# @insecur/notifications Context

Scoped context for agents working in `packages/notifications`. This file is a
reading map, not an independent glossary.

## Role

This package owns outbound notification contracts: the metadata-only event envelope, its
signature, the webhook event catalog, and webhook subscription lifecycle. A notification
says that something happened; it never carries what happened to.

## Read First

- `../../docs/adr/0030-hybrid-allowlisted-telemetry.md`
- `../../docs/security-and-privacy-posture-record.md`
- `../../CONTEXT-MAP.md`
- `packages/audit/CONTEXT.md`
- `packages/protected-change/CONTEXT.md`

## Terms To Load

- `../../docs/context/glossary/sensitive-data-safety.md`
- `../../docs/context/glossary/crypto-storage-audit.md`

## Adjacent Terms

- Audit Event authorship lives in `packages/audit/CONTEXT.md`.
- Approval state lives in `packages/protected-change/CONTEXT.md`.

## Owns

- Event notification envelope, canonical serialization, and HMAC signing/verification.
- The `assertMetadataOnlyEnvelope` guard, which fails closed on any Sensitive Value.
- Webhook event code catalog.
- Webhook subscription lifecycle and signing secret rotation.
- Approval notification envelopes and the approval delivery ports.

## Does Not Own

- Outbound HTTP delivery, retry, or backoff; delivery is injected through the ports.
- Approval decisions (`@insecur/protected-change`).
- Audit event authorship (`@insecur/audit`).
