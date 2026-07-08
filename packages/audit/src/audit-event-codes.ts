/**
 * First Value audit event names. Each security-relevant action has an explicit
 * success or denied event code; denied codes pair with stable result codes.
 */
import { ACCESS_AUDIT_EVENT_CODES } from "./codes/access.js";
import { assembleAuditEventCodes } from "./codes/assemble.js";
import { AUTH_AUDIT_EVENT_CODES } from "./codes/auth.js";
import { BOOTSTRAP_AUDIT_EVENT_CODES } from "./codes/bootstrap.js";
import { ONBOARDING_AUDIT_EVENT_CODES } from "./codes/onboarding.js";
import { RUNTIME_INJECTION_AUDIT_EVENT_CODES } from "./codes/runtime-injection.js";
import { SECRET_FIRST_VALUE_AUDIT_EVENT_CODES } from "./codes/secret-first-value.js";
import { APPROVALS_AUDIT_EVENT_CODES } from "./codes/approvals.js";
import { BACKUP_AUDIT_EVENT_CODES } from "./codes/backup.js";
import { CONNECTION_AUDIT_EVENT_CODES } from "./codes/connection.js";
import { CRYPTO_AUDIT_EVENT_CODES } from "./codes/crypto.js";
import { HIGH_ASSURANCE_AUDIT_EVENT_CODES } from "./codes/high-assurance.js";
import { MACHINE_ACCESS_AUDIT_EVENT_CODES } from "./codes/machine-access.js";
import { NOTIFICATIONS_AUDIT_EVENT_CODES } from "./codes/notifications.js";
import { OPERATION_AUDIT_EVENT_CODES } from "./codes/operation.js";
import { RUNTIME_INJECTION_POLICY_AUDIT_EVENT_CODES } from "./codes/runtime-injection-policy.js";
import { SECRET_PROTECTED_AUDIT_EVENT_CODES } from "./codes/secret-protected.js";
import { SYNC_AUDIT_EVENT_CODES } from "./codes/sync.js";

export const FIRST_VALUE_AUDIT_EVENT_CODES = assembleAuditEventCodes(
  "FIRST_VALUE_AUDIT_EVENT_CODES",
  BOOTSTRAP_AUDIT_EVENT_CODES,
  ONBOARDING_AUDIT_EVENT_CODES,
  SECRET_FIRST_VALUE_AUDIT_EVENT_CODES,
  RUNTIME_INJECTION_AUDIT_EVENT_CODES,
  ACCESS_AUDIT_EVENT_CODES,
  AUTH_AUDIT_EVENT_CODES,
);

/**
 * Production audit event names for sync, key custody, and approval workflows.
 * Writers must pair success and denied codes with matching outcomes.
 */
export const PRODUCTION_AUDIT_EVENT_CODES = assembleAuditEventCodes(
  "PRODUCTION_AUDIT_EVENT_CODES",
  MACHINE_ACCESS_AUDIT_EVENT_CODES,
  SYNC_AUDIT_EVENT_CODES,
  CRYPTO_AUDIT_EVENT_CODES,
  APPROVALS_AUDIT_EVENT_CODES,
  SECRET_PROTECTED_AUDIT_EVENT_CODES,
  HIGH_ASSURANCE_AUDIT_EVENT_CODES,
  BACKUP_AUDIT_EVENT_CODES,
  CONNECTION_AUDIT_EVENT_CODES,
  OPERATION_AUDIT_EVENT_CODES,
  RUNTIME_INJECTION_POLICY_AUDIT_EVENT_CODES,
  NOTIFICATIONS_AUDIT_EVENT_CODES,
);

/** All supported tenant-qualified audit event codes. */
export const AUDIT_EVENT_CODES = assembleAuditEventCodes(
  "AUDIT_EVENT_CODES",
  FIRST_VALUE_AUDIT_EVENT_CODES,
  PRODUCTION_AUDIT_EVENT_CODES,
);

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
  FIRST_VALUE_AUDIT_EVENT_CODES.authCliPkceExchangeDenied,
]);

export const DENIED_PRODUCTION_AUDIT_EVENT_CODES = new Set<ProductionAuditEventCode>([
  PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchangeDenied,
  PRODUCTION_AUDIT_EVENT_CODES.machineDeployKeyExchangeDenied,
  PRODUCTION_AUDIT_EVENT_CODES.syncExecutionDenied,
  PRODUCTION_AUDIT_EVENT_CODES.syncRevalidationDenied,
  PRODUCTION_AUDIT_EVENT_CODES.cryptoDataKeyDenied,
  PRODUCTION_AUDIT_EVENT_CODES.cryptoKeyRotationDenied,
  PRODUCTION_AUDIT_EVENT_CODES.approvalActionDenied,
  PRODUCTION_AUDIT_EVENT_CODES.secretProtectedDraftWriteDenied,
  PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequestDenied,
  PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeClearDenied,
  PRODUCTION_AUDIT_EVENT_CODES.highAssuranceEvidenceConsumeDenied,
  PRODUCTION_AUDIT_EVENT_CODES.connectionCreateDenied,
  PRODUCTION_AUDIT_EVENT_CODES.connectionValidationDenied,
  PRODUCTION_AUDIT_EVENT_CODES.connectionDisableDenied,
  PRODUCTION_AUDIT_EVENT_CODES.connectionCredentialAttachDenied,
  PRODUCTION_AUDIT_EVENT_CODES.operationCancelDenied,
  PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyCreateDenied,
  PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyDisableDenied,
  PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreateDenied,
  PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionUpdateDenied,
  PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionDeleteDenied,
  PRODUCTION_AUDIT_EVENT_CODES.webhookDeliveryFailed,
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
