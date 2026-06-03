/**
 * First Value audit event names. Each security-relevant action has an explicit
 * success or denied event code; denied codes pair with stable result codes.
 */
export const FIRST_VALUE_AUDIT_EVENT_CODES = {
  bootstrapInstanceOperatorGranted: "bootstrap.instance_operator_granted",
  bootstrapOwnerMembershipGranted: "bootstrap.owner_membership_granted",
  bootstrapOperatorClaimDenied: "bootstrap.operator_claim_denied",
  onboardingGuidedProvisioned: "onboarding.guided_organization_provisioned",
  onboardingGuidedProvisionDenied: "onboarding.guided_organization_provision_denied",
  onboardingOperatorOrganizationCreated: "onboarding.operator_organization_created",
  onboardingOperatorOrganizationDenied: "onboarding.operator_organization_denied",
  onboardingInvitationCreated: "onboarding.invitation_created",
  onboardingInvitationCreateDenied: "onboarding.invitation_create_denied",
  onboardingInvitationAccepted: "onboarding.invitation_accepted",
  onboardingInvitationAcceptDenied: "onboarding.invitation_accept_denied",
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

/**
 * Production audit event names for sync, key custody, and approval workflows.
 * Writers must pair success and denied codes with matching outcomes.
 */
export const PRODUCTION_AUDIT_EVENT_CODES = {
  machineGithubActionsOidcExchanged: "machine_auth.github_actions_oidc_exchanged",
  machineGithubActionsOidcExchangeDenied: "machine_auth.github_actions_oidc_exchange_denied",
  syncExecutionCompleted: "sync.execution_completed",
  syncExecutionDenied: "sync.execution_denied",
  syncRevalidationDenied: "sync.revalidation_denied",
  cryptoDataKeyReady: "crypto.data_key_ready",
  cryptoDataKeyDenied: "crypto.data_key_denied",
  cryptoKeyRotationPlanned: "crypto.key_rotation_planned",
  cryptoKeyRotationDenied: "crypto.key_rotation_denied",
  approvalRequestCreated: "approval.request_created",
  approvalRequestApproved: "approval.request_approved",
  approvalRequestRejected: "approval.request_rejected",
  approvalActionDenied: "approval.action_denied",
} as const;

/** All supported tenant-qualified audit event codes. */
export const AUDIT_EVENT_CODES = {
  ...FIRST_VALUE_AUDIT_EVENT_CODES,
  ...PRODUCTION_AUDIT_EVENT_CODES,
} as const;

export type FirstValueAuditEventCode =
  (typeof FIRST_VALUE_AUDIT_EVENT_CODES)[keyof typeof FIRST_VALUE_AUDIT_EVENT_CODES];

export type ProductionAuditEventCode =
  (typeof PRODUCTION_AUDIT_EVENT_CODES)[keyof typeof PRODUCTION_AUDIT_EVENT_CODES];

export type AuditEventCode = (typeof AUDIT_EVENT_CODES)[keyof typeof AUDIT_EVENT_CODES];

const AUDIT_EVENT_CODE_SET = new Set<string>(Object.values(AUDIT_EVENT_CODES));

const FIRST_VALUE_AUDIT_EVENT_CODE_SET = new Set<string>(
  Object.values(FIRST_VALUE_AUDIT_EVENT_CODES),
);

export const DENIED_FIRST_VALUE_AUDIT_EVENT_CODES = new Set<FirstValueAuditEventCode>([
  FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunDenied,
  FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
]);

export const DENIED_PRODUCTION_AUDIT_EVENT_CODES = new Set<ProductionAuditEventCode>([
  PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchangeDenied,
  PRODUCTION_AUDIT_EVENT_CODES.syncExecutionDenied,
  PRODUCTION_AUDIT_EVENT_CODES.syncRevalidationDenied,
  PRODUCTION_AUDIT_EVENT_CODES.cryptoDataKeyDenied,
  PRODUCTION_AUDIT_EVENT_CODES.cryptoKeyRotationDenied,
  PRODUCTION_AUDIT_EVENT_CODES.approvalActionDenied,
]);

export const DENIED_AUDIT_EVENT_CODES = new Set<AuditEventCode>([
  ...DENIED_FIRST_VALUE_AUDIT_EVENT_CODES,
  ...DENIED_PRODUCTION_AUDIT_EVENT_CODES,
]);

export const SUCCESS_FIRST_VALUE_AUDIT_EVENT_CODES = new Set<FirstValueAuditEventCode>(
  Object.values(FIRST_VALUE_AUDIT_EVENT_CODES).filter(
    (code) => !DENIED_FIRST_VALUE_AUDIT_EVENT_CODES.has(code),
  ),
);

export const SUCCESS_PRODUCTION_AUDIT_EVENT_CODES = new Set<ProductionAuditEventCode>(
  Object.values(PRODUCTION_AUDIT_EVENT_CODES).filter(
    (code) => !DENIED_PRODUCTION_AUDIT_EVENT_CODES.has(code),
  ),
);

export const SUCCESS_AUDIT_EVENT_CODES = new Set<AuditEventCode>([
  ...SUCCESS_FIRST_VALUE_AUDIT_EVENT_CODES,
  ...SUCCESS_PRODUCTION_AUDIT_EVENT_CODES,
]);

export function isAuditEventCode(value: string): value is AuditEventCode {
  return AUDIT_EVENT_CODE_SET.has(value);
}

export function isFirstValueAuditEventCode(value: string): value is FirstValueAuditEventCode {
  return FIRST_VALUE_AUDIT_EVENT_CODE_SET.has(value);
}

/** Stable result code stored for successful audit events. */
export const AUDIT_SUCCESS_RESULT_CODE = "audit.succeeded" as const;
