# ADR-0030: Hybrid Allowlisted Operational Telemetry

Date: 2026-05-24

Status: Accepted

Operational telemetry (application logs, errors, traces, performance) is hybrid: raw logs stay Cloudflare-native (Workers observability and Logpush to the operator's own R2), and a separate, allowlist-emit, metadata-only stream goes to an external sink (Axiom) for querying and alerting. This is distinct from the audit log, which remains in D1 with tenant-qualified, allowlisted metadata. Telemetry exists under Secret-Free Logging, so the external stream is built by emitting only an explicitly constructed set of structured fields (event type, opaque resource IDs, request ID, actor type, result/status code, timing, error class/code) and nothing else. It never carries free-form interpolated messages, exception objects with stack locals, or request, response, or provider bodies. Sentry is permitted only with its default PII, request-data, breadcrumb, and local-variable capture disabled, because that capture is denylist-by-default and would eventually ship a Sensitive Value off-platform.

## Considered Options

- **Cloudflare-native only**, keeping all telemetry inside the trust boundary. Rejected: weaker error grouping, alerting, and search than the operator needs.
- **External-first SDK instrumentation** (Sentry/Axiom auto-capture). Rejected: the worst leak surface for a secrets manager, since unscrubbed error context could carry a Sensitive Value off-platform.

## Consequences

Redaction is allowlist-by-construction, not scrub-by-denylist, so the safety property holds even when new code paths emit events. The external sink is a subprocessor held to the same allowlist as the audit log. The main regression risk is a misconfigured SDK re-enabling auto-capture, so "telemetry auto-capture disabled" belongs in the security release gate (ADR-0008).
