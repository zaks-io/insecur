/**
 * First Value audit event names. Each security-relevant action has an explicit
 * success or denied event code; denied codes pair with {@link AUDIT_DENIED_RESULT_CODES}.
 */
export const FIRST_VALUE_AUDIT_EVENT_CODES = {
  onboardingGuidedProvisioned: "onboarding.guided_organization_provisioned",
  onboardingGuidedProvisionDenied: "onboarding.guided_organization_provision_denied",
  secretNonProtectedWrite: "secret.non_protected_write",
  secretNonProtectedWriteDenied: "secret.non_protected_write_denied",
  injectionGrantIssued: "runtime_injection.grant_issued",
  injectionGrantIssueDenied: "runtime_injection.grant_issue_denied",
  injectionGrantConsumed: "runtime_injection.grant_consumed",
  injectionGrantConsumeDenied: "runtime_injection.grant_consume_denied",
  injectionRunCompleted: "runtime_injection.run_completed",
  injectionRunDenied: "runtime_injection.run_denied",
  accessDenied: "access.denied",
} as const;

export type FirstValueAuditEventCode =
  (typeof FIRST_VALUE_AUDIT_EVENT_CODES)[keyof typeof FIRST_VALUE_AUDIT_EVENT_CODES];

const FIRST_VALUE_AUDIT_EVENT_CODE_SET = new Set<string>(
  Object.values(FIRST_VALUE_AUDIT_EVENT_CODES),
);

export const DENIED_FIRST_VALUE_AUDIT_EVENT_CODES = new Set<FirstValueAuditEventCode>([
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
]);

export const SUCCESS_FIRST_VALUE_AUDIT_EVENT_CODES = new Set<FirstValueAuditEventCode>(
  Object.values(FIRST_VALUE_AUDIT_EVENT_CODES).filter(
    (code) => !DENIED_FIRST_VALUE_AUDIT_EVENT_CODES.has(code),
  ),
);

export function isFirstValueAuditEventCode(value: string): value is FirstValueAuditEventCode {
  return FIRST_VALUE_AUDIT_EVENT_CODE_SET.has(value);
}

/** Stable result code stored for successful audit events. */
export const AUDIT_SUCCESS_RESULT_CODE = "audit.succeeded" as const;
