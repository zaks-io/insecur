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
  },
  {
    id: "no_plaintext.worker_traces",
    surface: "worker_traces",
    evidencePath: "no-plaintext/worker-traces.json",
    requiredEvidenceAdapter: "deployed_worker_trace_query",
    implementationStatus: "external_evidence_required",
  },
  {
    id: "no_plaintext.api_analytics",
    surface: "api_analytics",
    evidencePath: "no-plaintext/api-analytics.json",
    requiredEvidenceAdapter: "deployed_api_analytics_query",
    implementationStatus: "external_evidence_required",
  },
] as const;
