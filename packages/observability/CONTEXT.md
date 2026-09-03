# @insecur/observability Context

Scoped context for agents working in `packages/observability`. This file is a
reading map, not an independent glossary.

## Role

This package owns shared Sentry option construction for Worker and browser runtimes so every
deploy reports with consistent environment, release, and service tags.

## Read First

- `../../docs/adr/0030-hybrid-allowlisted-telemetry.md`
- `../../docs/adr/0085-deployed-telemetry-evidence-surfaces.md`
- `../../docs/security-and-privacy-posture-record.md`

## Terms To Load

- `../../docs/context/glossary/sensitive-data-safety.md`

## Adjacent Terms

- The audit record, which is the durable tenant-facing history, lives in
  `packages/audit/CONTEXT.md`. Telemetry is operational and is not that record.

## Owns

- The `SentryBindings` shape read from Worker environment bindings.
- Worker and browser Sentry option construction.
- The router tracing integration seam for the browser runtime.

## Does Not Own

- Sentry initialization order or lifecycle in any app.
- Source map upload or release creation; those live in the deploy workflows.
- Audit events (`@insecur/audit`).

## Plaintext Rule

Nothing tenant-scoped or secret-derived may reach a Sentry tag, breadcrumb, or context through
this package. Telemetry is allowlisted, not filtered after the fact (ADR-0030).
