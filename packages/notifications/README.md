# @insecur/notifications

Metadata-only event notification envelopes and webhook subscriptions.

Notifications tell a subscriber that something happened. They never carry the thing that
happened to. Every envelope is asserted metadata-only before it is signed.

## Owns

- The event notification envelope, its canonical serialization, and HMAC signing/verification.
- The `assertMetadataOnlyEnvelope` guard that fails closed on any Sensitive Value.
- The webhook event code catalog.
- Webhook subscription lifecycle: create, list, update, delete, and signing secret rotation.
- Approval notification envelopes and the approval delivery ports.
- Webhook and approval notification audit records.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/access` for Effective Access on subscription mutations.
- `@insecur/crypto` and `@insecur/custody-contracts` for signing secret custody.
- `@insecur/audit` for notification audit events.
- `@insecur/tenant-store` for tenant-scoped subscription persistence.

## Does Not Own

- Outbound HTTP delivery, retry, or backoff. Delivery is injected through the delivery ports.
- Approval decisions (`@insecur/protected-change`).
- Audit event authorship (`@insecur/audit`); this package registers an emitter, it does not
  own the event.

## Interface Tests

Tests assert that a signed envelope round-trips verification, that a tampered envelope fails,
and that an envelope carrying a Sensitive Value is rejected before signing. Subscription
integration tests cover tenant-scoped isolation and signing secret rotation.

## Dependency Rule

The metadata-only assertion runs on every envelope before signing. No code path may signed-
serialize an envelope that skipped it.
