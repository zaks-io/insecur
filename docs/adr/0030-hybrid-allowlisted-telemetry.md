# ADR-0030: Hybrid Allowlisted Operational Telemetry

Date: 2026-05-24

Status: Accepted

Amended: 2026-07-10 (configured sinks are the Workers observability destinations recorded in [ADR-0085](0085-deployed-telemetry-evidence-surfaces.md); Logpush to R2 was never configured and is not an obligation)

Operational telemetry (application logs, errors, traces, performance) is hybrid: raw logs stay inside Workers observability (Cloudflare-retained, exported only through the configured Workers observability destinations; Logpush to the operator's R2 is not configured and carries no obligation while unconfigured — [ADR-0085](0085-deployed-telemetry-evidence-surfaces.md) records the configured destinations), and a separate, allowlist-emit, metadata-only stream goes to an external sink (Axiom) for querying and alerting. This is distinct from the audit log, which remains in Postgres through the Tenant-Scoped Store with tenant-qualified, allowlisted metadata. Telemetry exists under Secret-Free Logging, so the external stream is built by emitting only an explicitly constructed set of structured fields (event type, opaque resource IDs, request ID, actor type, result/status code, timing, error class/code) and nothing else. The structured stream never carries free-form interpolated messages, exception objects with stack locals, or request, response, or provider bodies. Sentry error diagnostics follow the amendment below. Sentry is permitted only with its default PII, request-data, breadcrumb, and local-variable capture disabled, because that capture is denylist-by-default and would eventually ship a Sensitive Value off-platform.

## Sentry error diagnostics amendment, 2026-09-16

Sentry error messages, exception types, severity, stack frame locations, and source-map debug
metadata are retained for diagnosis and error grouping. This supersedes blanket replacement of
messages and removal of stack traces. The shared `beforeSend` sanitizer removes recognizable
personal information and credentials from diagnostic strings. User profiles, request bodies,
headers, cookies, breadcrumbs, stack locals, source context, and arbitrary extra/context data
remain excluded. Caller-supplied tags remain excluded except for the CLI metadata allowlist.

This is targeted scrubbing of error diagnostics, not a guarantee that arbitrary sensitive text
can be recognized. Callers must never interpolate secret values or personal records into errors.
Structured operational logs and audit records retain their existing allowlist requirements.

The implementation uses Sentry
[`beforeSend` hooks](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/)
and keeps automatic collection of personal information and request content disabled.

## Considered Options

- **Cloudflare-native only**, keeping all telemetry inside the trust boundary. Rejected: weaker error grouping, alerting, and search than the operator needs.
- **External-first SDK instrumentation** (Sentry/Axiom auto-capture). Rejected: the worst leak surface for a secrets manager, since unscrubbed error context could carry a Sensitive Value off-platform.

## Consequences

Structured telemetry is allowlist-by-construction. Sentry error diagnostics use the targeted scrubbing described in the amendment; messages must not contain secret values or personal records. The external sink is a subprocessor held to the same allowlist as the audit log. The main regression risk is a misconfigured SDK re-enabling auto-capture, so "telemetry auto-capture disabled" belongs in the security release gate (ADR-0008). Sentry `beforeSend` (`prepareSentryEvent` in `@insecur/observability`) drops caller-supplied tags and retains only the configured `service` tag so error paths cannot smuggle Sensitive Values into off-platform grouping metadata.
