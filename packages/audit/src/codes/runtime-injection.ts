export const RUNTIME_INJECTION_AUDIT_EVENT_CODES = {
  injectionGrantIssued: "runtime_injection.grant_issued",
  injectionGrantIssueDenied: "runtime_injection.grant_issue_denied",
  injectionGrantConsumed: "runtime_injection.grant_consumed",
  injectionGrantConsumeDenied: "runtime_injection.grant_consume_denied",
  injectionRunCompleted: "runtime_injection.run_completed",
  injectionRunDenied: "runtime_injection.run_denied",
} as const;
