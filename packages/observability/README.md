# @insecur/observability

Shared Sentry composition for Worker and browser runtimes.

One place to build Sentry options so every deploy reports with the same environment, release,
and service tags, and so no surface has to hand-roll DSN handling.

## Owns

- The `SentryBindings` shape read from Worker environment bindings.
- Worker and browser Sentry option construction from those bindings.
- The router tracing integration seam for the browser runtime.

## Consumes

- `@sentry/cloudflare` for Worker option types.

## Does Not Own

- Sentry initialization order or lifecycle in any specific app.
- Source map upload or release creation; those live in the deploy workflows.
- Audit events (`@insecur/audit`). Observability is operational telemetry, not the record.

## Error diagnostics

Worker, browser, and CLI error reports retain scrubbed messages, exception types, severity,
and stack locations for grouping and source-map resolution. Request payloads, user profiles,
breadcrumbs, stack locals, and arbitrary context are excluded. Callers must not interpolate
secret values or personal records into errors; text scrubbing cannot identify every sensitive
value. See [ADR-0030](../../docs/adr/0030-hybrid-allowlisted-telemetry.md).

## Interface Tests

Tests cover SDK option construction, preservation of error diagnostics, and targeted scrubbing
using synthetic personal information and credentials.

## Dependency Rule

This package must never receive a Sensitive Value. Nothing tenant-scoped or secret-derived
may be placed on a Sentry tag, breadcrumb, or context by this package.
