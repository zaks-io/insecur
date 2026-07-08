export const RUNTIME_INJECTION_AUDIT_EVENT_CODES = {
  injectionGrantIssued: "runtime_injection.grant_issued",
  injectionGrantIssueDenied: "runtime_injection.grant_issue_denied",
  injectionGrantConsumed: "runtime_injection.grant_consumed",
  injectionGrantConsumeDenied: "runtime_injection.grant_consume_denied",
  injectionGrantsRevokedTenantSuspension: "runtime_injection.grants_revoked_tenant_suspension",
  injectionGrantsRevokeTenantSuspensionDenied:
    "runtime_injection.grants_revoke_tenant_suspension_denied",
  injectionGrantsRevokedCompromiseVersion: "runtime_injection.grants_revoked_compromise_version",
  injectionGrantsRevokeCompromiseVersionDenied:
    "runtime_injection.grants_revoke_compromise_version_denied",
  injectionRunCompleted: "runtime_injection.run_completed",
  injectionRunDenied: "runtime_injection.run_denied",
} as const;
