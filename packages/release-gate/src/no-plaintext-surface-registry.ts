// Evidence-surface registry for no-plaintext controls that the canary gate cannot enumerate
// structurally (ADR-0069). Telemetry-bound entries pin the exact deployed sink behind each
// committed wrangler observability destination (ADR-0085); the deploy-topology conformance gate
// fails when a wrangler log/trace destination has no binding here, so a new destination cannot
// ship without a fail-closed evidence obligation.
export const NO_PLAINTEXT_EXTERNAL_SURFACES = [
  {
    id: "no_plaintext.r2_backup",
    surface: "r2_backup",
    evidencePath: "no-plaintext/r2-backup.json",
    requiredEvidenceAdapter: "scheduled_r2_artifact_sweep",
    implementationStatus: "external_evidence_required",
  },
  {
    id: "no_plaintext.worker_logs",
    surface: "worker_logs",
    evidencePath: "no-plaintext/worker-logs.json",
    requiredEvidenceAdapter: "deployed_worker_log_query",
    implementationStatus: "external_evidence_required",
    telemetry: {
      channel: "logs",
      wranglerDestination: "axiom-logs",
      provider: "axiom",
      targetRef: "axiom://dataset/cloudflare",
    },
  },
  {
    id: "no_plaintext.worker_traces.axiom",
    surface: "worker_traces",
    evidencePath: "no-plaintext/worker-traces-axiom.json",
    requiredEvidenceAdapter: "deployed_worker_trace_query",
    implementationStatus: "external_evidence_required",
    telemetry: {
      channel: "traces",
      wranglerDestination: "axiom-traces",
      provider: "axiom",
      targetRef: "axiom://dataset/cloudflare",
    },
  },
  {
    id: "no_plaintext.worker_traces.sentry",
    surface: "worker_traces",
    evidencePath: "no-plaintext/worker-traces-sentry.json",
    requiredEvidenceAdapter: "deployed_worker_trace_query",
    implementationStatus: "external_evidence_required",
    telemetry: {
      channel: "traces",
      wranglerDestination: "sentry-traces-insecur",
      provider: "sentry",
      targetRef: "sentry://zaksio/insecur",
    },
  },
  {
    id: "no_plaintext.api_analytics",
    surface: "api_analytics",
    evidencePath: "no-plaintext/api-analytics.json",
    requiredEvidenceAdapter: "deployed_api_analytics_query",
    implementationStatus: "external_evidence_required",
  },
] as const;
