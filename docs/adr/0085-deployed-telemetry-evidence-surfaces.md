# ADR-0085: Deployed Telemetry Evidence Surfaces For No-Plaintext Controls

Date: 2026-07-10

Status: Accepted (amends [ADR-0030](0030-hybrid-allowlisted-telemetry.md) and
[ADR-0069](0069-no-plaintext-canary-gate.md))

[ADR-0069](0069-no-plaintext-canary-gate.md) registered deployed Worker logs and traces as
external no-plaintext evidence surfaces but never said which deployed systems hold that telemetry,
and [ADR-0030](0030-hybrid-allowlisted-telemetry.md) described a sink topology (Cloudflare-native
raw logs with Logpush to the operator's R2) that was never configured. The committed Worker
configs are the ground truth: every `apps/*/wrangler.jsonc` deploy exports Workers observability
logs to the Cloudflare destination `axiom-logs` and traces to the destinations `axiom-traces` and
`sentry-traces-insecur`. The log and trace sweeps (INS-567, INS-566) need an authoritative,
enforced answer to "which systems must a zero-finding sweep cover" before they can exist.

## Decision

The deployed telemetry surfaces for the no-plaintext release-evidence controls are exactly the
sinks the committed Worker configs export to, bound in the evidence-surface registry
`packages/release-gate/src/no-plaintext-surface-registry.ts` (the code-owned registry; the paired
doc section is "Deployed telemetry evidence surfaces" in
[docs/security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md)).

- **Worker logs** (`no_plaintext.worker_logs`): query the Axiom sink behind the `axiom-logs`
  destination. Log evidence requires Axiom; there is no second log provider.
- **Worker traces**: query BOTH trace sinks, as two independent blocking controls —
  `no_plaintext.worker_traces.axiom` (the Axiom sink behind `axiom-traces`) and
  `no_plaintext.worker_traces.sentry` (Sentry org/project `zaksio/insecur`, the sink behind
  `sentry-traces-insecur`). Either provider's evidence missing, invalid, or non-zero-finding
  blocks `small_group_production`. Both are configured egress; a sink the Workers ship data to
  but no sweep reads is uncovered egress.
- **Cloudflare-native logs/traces and R2 Logpush are not sinks and carry no release-evidence
  obligation while unconfigured.** No deploy enables `logpush` or `tail_consumers`, and no R2
  Logpush job exists. ADR-0030's contrary description is amended. If one is ever configured, it
  becomes a new destination under the rule below.
- **A new destination fails closed until a real query adapter covers it.** The deploy-topology
  conformance gate (`pnpm conformance:topology`) rejects any wrangler log/trace destination
  without a telemetry binding in the registry, any registry telemetry binding without a configured
  destination, and any `logpush`/`tail_consumers` declaration. A registry entry without adapter
  evidence already blocks the `small_group_production` profile as `missing_evidence` (ADR-0069),
  so registering a destination creates the obligation, and only a zero-finding sweep discharges
  it.

Each telemetry binding pins the provider target the evidence must reference (`targetRef`, for
example `axiom://dataset/cloudflare` and `sentry://zaksio/insecur`), and the release gate rejects
telemetry evidence whose `target_ref` differs or whose `query_window` is absent. Evidence produced
against one provider therefore cannot be copied to satisfy another, so a provider copy cannot
silently reduce coverage.

A canary run is correlated by its run identifier (`sentinel_run_id`), deploy identity
(`DEPLOY_SHA`, `DEPLOY_RUN_ID`, `SENTRY_RELEASE`), service names, and the query time window —
never by the sentinel value. Sweeps download candidate events for the window and match sentinels
locally; sentinel values never appear in provider queries, evidence artifacts, CI logs, or the
tracker. Evidence artifacts stay metadata-only: target reference, query window, canary run ID,
finding count, and timestamp. Operational specifics — exact identifiers, config lookup locations,
query windows, retention assumptions, and credential names — live in the paired doc section in
[docs/security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).

## Considered Options

- **Keep Cloudflare-native retention and R2 Logpush as evidence surfaces.** Rejected: neither is
  configured, so the obligation would attest sweeps of sinks that hold no data — evidence theater
  that a real leak never crosses.
- **One trace provider (Axiom only or Sentry only).** Rejected: both destinations are committed
  egress from every deploy. Sweeping one leaves the other an off-platform copy of the same spans
  with no no-plaintext check.
- **Registry without a wrangler conformance rule.** Rejected: an agent adding a destination has no
  structural forcing function to add the evidence obligation, which is exactly how coverage rots.

## Consequences

- ADR-0030's raw-log sink description is amended in place; the hybrid allowlist-emit contract and
  the Sentry auto-capture prohibition stand unchanged.
- ADR-0069's `worker_traces` registry row splits into per-provider controls; control IDs and
  evidence artifact paths change in `packages/release-gate` and
  [docs/security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
- INS-567 (log sweep) and INS-566 (trace sweep) implement the query adapters against these pinned
  targets; until then the controls block `small_group_production` as `missing_evidence`.
- The Cloudflare destination configuration (which Axiom dataset a destination feeds) lives outside
  this repository; the registry pins the expected target, and a sweep run against a different
  target produces evidence the gate rejects.
