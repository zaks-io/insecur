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

## Interface Tests

Covered through the consuming apps. Any test added here must assert option construction from
bindings only; do not assert against a live Sentry client.

## Dependency Rule

This package must never receive a Sensitive Value. Nothing tenant-scoped or secret-derived
may be placed on a Sentry tag, breadcrumb, or context by this package.
